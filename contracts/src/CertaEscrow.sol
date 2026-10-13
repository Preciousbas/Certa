// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice One project escrow. Deployed behind an EIP-1167 clone. Not upgradeable.
contract CertaEscrow is Initializable, ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_STAGES = 64;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant CLIENT_APPROVE_TYPEHASH =
        keccak256("ClientApprove(bytes32 projectId,uint256 stage,uint256 deadline)");
    bytes32 private constant VARIATION_TYPEHASH =
        keccak256("AddVariation(bytes32 projectId,uint256 amount,uint16 retentionBps,uint256 nonce,uint256 deadline)");
    bytes32 private constant RESOLVE_TYPEHASH =
        keccak256("ResolveDispute(bytes32 projectId,uint256 stage,uint16 payBps,uint256 deadline)");

    enum StageStatus {
        Pending,
        Funded,
        Submitted,
        Released,
        Disputed,
        Cancelled
    }

    struct Stage {
        uint256 amount;
        uint16 retentionBps;
        StageStatus status;
        uint256 releasedAmount;
        uint256 retentionHeld;
        bytes32 evidenceHash;
        bool clientApproved;
    }

    struct InitParams {
        address client;
        address contractor;
        address consultant;
        address operator;
        address admin;
        address token;
        uint256[] stageAmounts;
        uint16 retentionBps;
        uint256 mobilisationAmount;
        uint256 spendingCap;
        bytes32 termsHash;
        uint64 defectsPeriodSeconds;
        bytes32 projectId;
    }

    address public client;
    address public contractor;
    address public consultant;
    address public operator;
    IERC20 public token;
    bytes32 public termsHash;
    bytes32 public projectId;
    uint256 public mobilisationAmount;
    uint256 public spendingCap;
    uint64 public defectsPeriodSeconds;
    uint64 public defectsPeriodEnd;
    uint16 public defaultRetentionBps;

    bool public clientAccepted;
    bool public contractorAccepted;
    bool public mobilisationFunded;
    bool public mobilisationReleased;
    bool public mobilisationRefunded;
    bool public cancelled;

    uint256 public totalFunded;
    uint256 public totalOut;
    uint256 public paidToContractor;
    uint256 public retentionOutstanding;
    uint256 public totalRetentionReleased;
    uint256 public variationNonce;

    Stage[] public stages;

    event Funded(bytes32 indexed projectId, uint256 indexed upToStage, uint256 amount, address indexed funder);
    event StageSubmitted(bytes32 indexed projectId, uint256 indexed stage, bytes32 evidenceHash);
    event StageReleased(bytes32 indexed projectId, uint256 indexed stage, uint256 payout, uint256 retentionHeld);
    event StageDisputed(bytes32 indexed projectId, uint256 indexed stage, bytes32 reasonHash, address by);
    event DisputeResolved(
        bytes32 indexed projectId, uint256 indexed stage, uint16 payBps, uint256 payout, uint256 refunded
    );
    event RetentionReleased(bytes32 indexed projectId, uint256 amount);
    event VariationAdded(bytes32 indexed projectId, uint256 indexed stage, uint256 amount);
    event MobilisationReleased(bytes32 indexed projectId, uint256 amount);
    event ClientApproved(bytes32 indexed projectId, uint256 indexed stage);
    event TermsAccepted(bytes32 indexed projectId, address indexed party);
    event Refunded(bytes32 indexed projectId, uint256 amount);
    event Cancelled(bytes32 indexed projectId, uint256 refunded);
    event DefectsPeriodStarted(bytes32 indexed projectId, uint64 endsAt);

    error ZeroAddress();
    error ZeroAmount();
    error BadBps();
    error BadStageCount();
    error EmptyTerms();
    error SameParty();
    error StageOutOfRange();
    error AmountMismatch(uint256 expected, uint256 actual);
    error NotAuthorized();
    error BadStatus();
    error CapExceeded();
    error AlreadyApproved();
    error AlreadyMobilised();
    error MobilisationNotFunded();
    error TermsNotAccepted();
    error BadSignature();
    error SignatureExpired();
    error DefectsPeriodActive();
    error NothingToRelease();
    error NothingToRefund();
    error EvidenceRequired();
    error EmptyReason();
    error CancelledProject();
    error FeeOnTransfer();
    error EthNotAccepted();
    error AlreadyStarted();

    constructor() {
        _disableInitializers();
    }

    function initialize(InitParams calldata p) external initializer {
        if (
            p.client == address(0) || p.contractor == address(0) || p.consultant == address(0)
                || p.operator == address(0) || p.admin == address(0) || p.token == address(0)
        ) revert ZeroAddress();
        if (p.client == p.contractor) revert SameParty();
        if (p.retentionBps > BPS) revert BadBps();
        if (p.termsHash == bytes32(0) || p.projectId == bytes32(0)) revert EmptyTerms();
        if (p.stageAmounts.length == 0 || p.stageAmounts.length > MAX_STAGES) revert BadStageCount();

        client = p.client;
        contractor = p.contractor;
        consultant = p.consultant;
        operator = p.operator;
        token = IERC20(p.token);
        termsHash = p.termsHash;
        projectId = p.projectId;
        mobilisationAmount = p.mobilisationAmount;
        spendingCap = p.spendingCap;
        defectsPeriodSeconds = p.defectsPeriodSeconds;
        defaultRetentionBps = p.retentionBps;

        for (uint256 i = 0; i < p.stageAmounts.length; ++i) {
            if (p.stageAmounts[i] == 0) revert ZeroAmount();
            stages.push(
                Stage({
                    amount: p.stageAmounts[i],
                    retentionBps: p.retentionBps,
                    status: StageStatus.Pending,
                    releasedAmount: 0,
                    retentionHeld: 0,
                    evidenceHash: bytes32(0),
                    clientApproved: false
                })
            );
        }

        _grantRole(DEFAULT_ADMIN_ROLE, p.admin);
        _grantRole(PAUSER_ROLE, p.admin);
    }

    function stageCount() external view returns (uint256) {
        return stages.length;
    }

    function expectedBalance() external view returns (uint256) {
        return totalFunded - totalOut;
    }

    function maxContractorReceivable() public view returns (uint256 sum) {
        sum = mobilisationAmount;
        for (uint256 i = 0; i < stages.length; ++i) {
            sum += stages[i].amount;
        }
    }

    function quoteFund(uint8 upToStage) public view returns (uint256 expected) {
        if (upToStage >= stages.length) revert StageOutOfRange();
        if (!mobilisationFunded && !mobilisationRefunded && mobilisationAmount > 0) {
            expected = mobilisationAmount;
        }
        for (uint256 i = 0; i <= upToStage; ++i) {
            if (stages[i].status == StageStatus.Pending) expected += stages[i].amount;
        }
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("CertaEscrow")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function hashClientApprove(uint256 stage, uint256 deadline) public view returns (bytes32) {
        return _hashTypedData(keccak256(abi.encode(CLIENT_APPROVE_TYPEHASH, projectId, stage, deadline)));
    }

    function hashVariation(uint256 amount, uint16 retentionBps, uint256 nonce, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedData(keccak256(abi.encode(VARIATION_TYPEHASH, projectId, amount, retentionBps, nonce, deadline)));
    }

    function hashResolve(uint256 stage, uint16 payBps, uint256 deadline) public view returns (bytes32) {
        return _hashTypedData(keccak256(abi.encode(RESOLVE_TYPEHASH, projectId, stage, payBps, deadline)));
    }

    function acceptTerms() external {
        if (msg.sender == client) clientAccepted = true;
        else if (msg.sender == contractor) contractorAccepted = true;
        else revert NotAuthorized();
        emit TermsAccepted(projectId, msg.sender);
    }

    function fund(uint256 amount, uint8 upToStage) external nonReentrant whenNotPaused {
        if (msg.sender != client) revert NotAuthorized();
        if (cancelled) revert CancelledProject();
        if (!clientAccepted || !contractorAccepted) revert TermsNotAccepted();
        uint256 expected = quoteFund(upToStage);
        if (expected == 0) revert ZeroAmount();
        if (amount != expected) revert AmountMismatch(expected, amount);

        if (!mobilisationFunded && !mobilisationRefunded && mobilisationAmount > 0) {
            mobilisationFunded = true;
        }
        for (uint256 i = 0; i <= upToStage; ++i) {
            if (stages[i].status == StageStatus.Pending) {
                stages[i].status = StageStatus.Funded;
            }
        }
        totalFunded += amount;
        emit Funded(projectId, upToStage, amount, msg.sender);
        _pull(amount);
    }

    function releaseMobilisation() external nonReentrant whenNotPaused {
        if (msg.sender != operator && msg.sender != client) revert NotAuthorized();
        if (!clientAccepted || !contractorAccepted) revert TermsNotAccepted();
        if (mobilisationAmount == 0) revert NothingToRelease();
        if (!mobilisationFunded) revert MobilisationNotFunded();
        if (mobilisationReleased) revert AlreadyMobilised();
        mobilisationReleased = true;
        totalOut += mobilisationAmount;
        paidToContractor += mobilisationAmount;
        emit MobilisationReleased(projectId, mobilisationAmount);
        _pay(contractor, mobilisationAmount);
    }

    function submitStage(uint256 i, bytes32 evidenceHash) external whenNotPaused {
        if (msg.sender != operator) revert NotAuthorized();
        if (cancelled) revert CancelledProject();
        if (evidenceHash == bytes32(0)) revert EvidenceRequired();
        Stage storage stage = _stage(i);
        if (stage.status != StageStatus.Funded) revert BadStatus();
        stage.status = StageStatus.Submitted;
        stage.evidenceHash = evidenceHash;
        emit StageSubmitted(projectId, i, evidenceHash);
    }

    function clientApprove(uint256 i) external whenNotPaused {
        if (msg.sender != client) revert NotAuthorized();
        _approve(i);
    }

    function clientApproveWithSig(uint256 i, uint256 deadline, bytes calldata sig) external whenNotPaused {
        if (msg.sender != operator && msg.sender != client) revert NotAuthorized();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (sig.length != 65) revert BadSignature();
        if (ECDSA.recover(hashClientApprove(i, deadline), sig) != client) revert BadSignature();
        _approve(i);
    }

    function releaseStage(uint256 i) external nonReentrant whenNotPaused {
        if (msg.sender != operator) revert NotAuthorized();
        Stage storage stage = _stage(i);
        if (stage.status != StageStatus.Submitted) revert BadStatus();
        if (stage.amount > spendingCap && !stage.clientApproved) revert CapExceeded();
        (uint256 payout, uint256 retention) = _split(stage.amount, stage.retentionBps);
        stage.status = StageStatus.Released;
        stage.releasedAmount = payout;
        stage.retentionHeld = retention;
        retentionOutstanding += retention;
        totalOut += payout;
        paidToContractor += payout;
        emit StageReleased(projectId, i, payout, retention);
        _pay(contractor, payout);
    }

    function dispute(uint256 i, bytes32 reasonHash) external {
        if (msg.sender != client && msg.sender != contractor) revert NotAuthorized();
        if (reasonHash == bytes32(0)) revert EmptyReason();
        Stage storage stage = _stage(i);
        if (stage.status != StageStatus.Funded && stage.status != StageStatus.Submitted) revert BadStatus();
        stage.status = StageStatus.Disputed;
        emit StageDisputed(projectId, i, reasonHash, msg.sender);
    }

    function resolveDispute(uint256 i, uint16 payBps) external nonReentrant whenNotPaused {
        if (msg.sender != consultant) revert NotAuthorized();
        _resolve(i, payBps);
    }

    function resolveDisputeWithSigs(
        uint256 i,
        uint16 payBps,
        uint256 deadline,
        bytes calldata clientSig,
        bytes calldata contractorSig
    ) external nonReentrant whenNotPaused {
        if (msg.sender != client && msg.sender != operator) revert NotAuthorized();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (clientSig.length != 65 || contractorSig.length != 65) revert BadSignature();
        bytes32 digest = hashResolve(i, payBps, deadline);
        if (ECDSA.recover(digest, clientSig) != client) revert BadSignature();
        if (ECDSA.recover(digest, contractorSig) != contractor) revert BadSignature();
        _resolve(i, payBps);
    }

    function startDefectsPeriod() external {
        if (msg.sender != client && msg.sender != consultant) revert NotAuthorized();
        if (defectsPeriodEnd != 0) revert AlreadyStarted();
        defectsPeriodEnd = uint64(block.timestamp) + defectsPeriodSeconds;
        emit DefectsPeriodStarted(projectId, defectsPeriodEnd);
    }

    function releaseRetention() external nonReentrant whenNotPaused {
        if (msg.sender != client && msg.sender != consultant) revert NotAuthorized();
        if (defectsPeriodEnd == 0 || block.timestamp < defectsPeriodEnd) revert DefectsPeriodActive();
        uint256 amount = retentionOutstanding;
        if (amount == 0) revert NothingToRelease();
        retentionOutstanding = 0;
        totalRetentionReleased += amount;
        totalOut += amount;
        paidToContractor += amount;
        emit RetentionReleased(projectId, amount);
        _pay(contractor, amount);
    }

    function addVariation(uint256 amount, uint16 retentionBps, uint256 deadline, bytes calldata clientSig, bytes calldata contractorSig)
        external
        whenNotPaused
    {
        if (cancelled) revert CancelledProject();
        if (amount == 0) revert ZeroAmount();
        if (retentionBps > BPS) revert BadBps();
        if (stages.length >= MAX_STAGES) revert BadStageCount();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (clientSig.length != 65 || contractorSig.length != 65) revert BadSignature();
        uint256 nonce = variationNonce;
        bytes32 digest = hashVariation(amount, retentionBps, nonce, deadline);
        if (ECDSA.recover(digest, clientSig) != client) revert BadSignature();
        if (ECDSA.recover(digest, contractorSig) != contractor) revert BadSignature();
        variationNonce = nonce + 1;
        stages.push(
            Stage({
                amount: amount,
                retentionBps: retentionBps,
                status: StageStatus.Pending,
                releasedAmount: 0,
                retentionHeld: 0,
                evidenceHash: bytes32(0),
                clientApproved: false
            })
        );
        emit VariationAdded(projectId, stages.length - 1, amount);
    }

    function refundUnfunded() external nonReentrant whenNotPaused returns (uint256 refunded) {
        if (msg.sender != client && msg.sender != operator) revert NotAuthorized();
        refunded = _refund(false);
    }

    function cancel() external nonReentrant whenNotPaused returns (uint256 refunded) {
        if (msg.sender != client) revert NotAuthorized();
        cancelled = true;
        refunded = _refund(true);
        emit Cancelled(projectId, refunded);
    }

    function pause() external {
        if (!hasRole(PAUSER_ROLE, msg.sender)) revert NotAuthorized();
        _pause();
    }

    function unpause() external {
        if (!hasRole(PAUSER_ROLE, msg.sender)) revert NotAuthorized();
        _unpause();
    }

    receive() external payable {
        revert EthNotAccepted();
    }

    function _approve(uint256 i) internal {
        Stage storage stage = _stage(i);
        if (stage.clientApproved) revert AlreadyApproved();
        stage.clientApproved = true;
        emit ClientApproved(projectId, i);
    }

    function _resolve(uint256 i, uint16 payBps) internal {
        if (payBps > BPS) revert BadBps();
        Stage storage stage = _stage(i);
        if (stage.status != StageStatus.Disputed) revert BadStatus();
        uint256 gross = (stage.amount * payBps) / BPS;
        (uint256 payout, uint256 retention) = _split(gross, stage.retentionBps);
        uint256 refunded = stage.amount - gross;
        stage.status = StageStatus.Released;
        stage.releasedAmount = payout;
        stage.retentionHeld = retention;
        retentionOutstanding += retention;
        totalOut += payout + refunded;
        paidToContractor += payout;
        emit DisputeResolved(projectId, i, payBps, payout, refunded);
        _pay(contractor, payout);
        _pay(client, refunded);
    }

    function _refund(bool includeMobilisation) internal returns (uint256 refunded) {
        for (uint256 i = 0; i < stages.length; ++i) {
            if (stages[i].status == StageStatus.Funded) {
                refunded += stages[i].amount;
                stages[i].status = StageStatus.Cancelled;
            }
        }
        if (includeMobilisation && mobilisationFunded && !mobilisationReleased) {
            refunded += mobilisationAmount;
            mobilisationFunded = false;
            mobilisationRefunded = true;
        }
        if (refunded == 0) revert NothingToRefund();
        totalOut += refunded;
        emit Refunded(projectId, refunded);
        _pay(client, refunded);
    }

    function _stage(uint256 i) internal view returns (Stage storage stage) {
        if (i >= stages.length) revert StageOutOfRange();
        stage = stages[i];
    }

    function _split(uint256 amount, uint16 retentionBps) internal pure returns (uint256 payout, uint256 retention) {
        retention = (amount * retentionBps) / BPS;
        payout = amount - retention;
    }

    function _pull(uint256 amount) internal {
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBal != amount) revert FeeOnTransfer();
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransfer(to, amount);
        if (beforeBal - token.balanceOf(address(this)) != amount) revert FeeOnTransfer();
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }
}
