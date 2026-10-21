// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CertaEscrow} from "../src/CertaEscrow.sol";
import {EscrowFactory} from "../src/EscrowFactory.sol";
import {TestUSDC, FeeToken, MaliciousToken} from "./mocks/Tokens.sol";

contract CertaEscrowTest is Test {
    TestUSDC internal token;
    CertaEscrow internal impl;
    EscrowFactory internal factory;
    CertaEscrow internal escrow;

    address internal client;
    uint256 internal clientPk;
    address internal contractor;
    uint256 internal contractorPk;
    address internal consultant;
    address internal operator;
    uint256 internal operatorPk;
    address internal admin;
    address internal stranger = makeAddr("stranger");

    uint256 internal constant MOB = 500_000;
    uint256 internal constant CAP = 2_000_000;
    bytes32 internal projectId = keccak256("project");
    bytes32 internal terms = keccak256("terms");

    function setUp() public {
        (client, clientPk) = makeAddrAndKey("client");
        (contractor, contractorPk) = makeAddrAndKey("contractor");
        consultant = makeAddr("consultant");
        (operator, operatorPk) = makeAddrAndKey("operator");
        admin = makeAddr("admin");
        token = new TestUSDC();
        impl = new CertaEscrow();
        factory = new EscrowFactory(address(impl));
        escrow = _deploy(address(token), _amounts3(), 500, MOB, CAP, 180 days);
    }

    function test_implementationCannotBeInitialized() public {
        CertaEscrow.InitParams memory params = _params(address(token), _amounts3(), 500, MOB, CAP);
        vm.expectRevert();
        impl.initialize(params);
    }

    function test_cloneCannotBeReinitialized() public {
        vm.expectRevert();
        escrow.initialize(_params(address(token), _amounts3(), 500, MOB, CAP));
    }

    function test_rejectsZeroAddressesAndBadInputs() public {
        CertaEscrow.InitParams memory params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.client = address(0);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.contractor = address(0);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.token = address(0);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.consultant = address(0);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.operator = address(0);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.admin = address(0);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.contractor = params.client;
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 10_001, MOB, CAP);
        _expectCreateRevert(params);
        params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.termsHash = bytes32(0);
        _expectCreateRevert(params);
        uint256[] memory empty;
        params = _params(address(token), empty, 500, MOB, CAP);
        _expectCreateRevert(params);
        uint256[] memory zero = new uint256[](1);
        zero[0] = 0;
        params = _params(address(token), zero, 500, MOB, CAP);
        _expectCreateRevert(params);
    }

    function test_factoryRejectsDuplicateProjectAndZeroImplementation() public {
        CertaEscrow.InitParams memory params = _params(address(token), _amounts3(), 500, MOB, CAP);
        params.projectId = keccak256("duplicate-project");
        factory.createEscrow(params);
        vm.expectRevert(EscrowFactory.ProjectExists.selector);
        factory.createEscrow(params);
        assertEq(factory.allEscrows(0), address(escrow));
        assertGe(factory.escrowCount(), 2);
        vm.expectRevert(EscrowFactory.ZeroAddress.selector);
        new EscrowFactory(address(0));
    }

    function test_fundRequiresBothAcceptances() public {
        uint256 amount = escrow.quoteFund(2);
        _mintApprove(amount);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.TermsNotAccepted.selector);
        escrow.fund(amount, 2);
    }

    function test_strangerCannotAcceptOrFund() public {
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.acceptTerms();
        _accept();
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.fund(1, 0);
    }

    function test_fullFundingThenTopUpIsExact() public {
        _accept();
        uint256 first = escrow.quoteFund(0);
        assertEq(first, MOB + 1_000_000);
        _fund(0);
        assertEq(token.balanceOf(address(escrow)), first);
        (,, CertaEscrow.StageStatus status,,,,) = escrow.stages(0);
        assertEq(uint256(status), uint256(CertaEscrow.StageStatus.Funded));

        uint256 second = escrow.quoteFund(2);
        assertEq(second, 2_000_000 + 3_000_000);
        _fund(2);
        assertEq(token.balanceOf(address(escrow)), first + second);
        assertEq(escrow.totalFunded(), first + second);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.ZeroAmount.selector);
        escrow.fund(1, 2);
    }

    function test_amountMismatchAndRange() public {
        _accept();
        uint256 expected = escrow.quoteFund(0);
        _mintApprove(expected);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(CertaEscrow.AmountMismatch.selector, expected, expected - 1));
        escrow.fund(expected - 1, 0);
        vm.expectRevert(CertaEscrow.StageOutOfRange.selector);
        escrow.quoteFund(3);
    }

    function test_mobilisationReleasedOnceAfterFunding() public {
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.TermsNotAccepted.selector);
        escrow.releaseMobilisation();
        _accept();
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.MobilisationNotFunded.selector);
        escrow.releaseMobilisation();
        _fund(0);
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.releaseMobilisation();
        vm.prank(operator);
        escrow.releaseMobilisation();
        assertEq(token.balanceOf(contractor), MOB);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.AlreadyMobilised.selector);
        escrow.releaseMobilisation();
    }

    function test_zeroMobilisationCannotRelease() public {
        CertaEscrow bare = _deploy(address(token), _amounts3(), 500, 0, CAP, 30 days);
        vm.prank(client);
        bare.acceptTerms();
        vm.prank(contractor);
        bare.acceptTerms();
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.NothingToRelease.selector);
        bare.releaseMobilisation();
    }

    function test_releaseUnderAndAtCapWithoutApproval() public {
        _accept();
        _fund(2);
        bytes32 evidence = keccak256("photos");
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.submitStage(0, evidence);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.EvidenceRequired.selector);
        escrow.submitStage(0, bytes32(0));
        vm.prank(operator);
        escrow.submitStage(0, evidence);
        vm.prank(operator);
        escrow.releaseStage(0);
        uint256 payout0 = 1_000_000 - 50_000;
        assertEq(token.balanceOf(contractor), payout0);
        assertEq(escrow.retentionOutstanding(), 50_000);

        vm.prank(operator);
        escrow.submitStage(1, evidence);
        vm.prank(operator);
        escrow.releaseStage(1);
        assertEq(token.balanceOf(contractor), payout0 + (2_000_000 - 100_000));
    }

    function test_aboveCapRequiresApprovalAndSignatureRelay() public {
        _accept();
        _fund(2);
        bytes32 evidence = keccak256("photos");
        vm.prank(operator);
        escrow.submitStage(2, evidence);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.CapExceeded.selector);
        escrow.releaseStage(2);

        vm.prank(operator);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.clientApprove(2);

        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = escrow.hashClientApprove(2, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(clientPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(operator);
        escrow.clientApproveWithSig(2, deadline, sig);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.AlreadyApproved.selector);
        escrow.clientApproveWithSig(2, deadline, sig);

        vm.prank(operator);
        escrow.releaseStage(2);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.releaseStage(2);
    }

    function test_clientApproveDirectlyAndExpiredSig() public {
        _accept();
        _fund(2);
        vm.prank(operator);
        escrow.submitStage(2, keccak256("e"));
        vm.prank(client);
        escrow.clientApprove(2);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.AlreadyApproved.selector);
        escrow.clientApprove(2);

        CertaEscrow other = _deploy(address(token), _amounts3(), 500, MOB, CAP, 10 days);
        vm.prank(other.client());
        other.acceptTerms();
        vm.prank(contractor);
        other.acceptTerms();
        _fundOn(other, 2);
        vm.prank(operator);
        other.submitStage(2, keccak256("e"));
        uint256 deadline = block.timestamp - 1;
        bytes32 digest = other.hashClientApprove(2, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(clientPk, digest);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.SignatureExpired.selector);
        other.clientApproveWithSig(2, deadline, abi.encodePacked(r, s, v));
    }

    function test_badSignatureRejected() public {
        _accept();
        _fund(2);
        vm.prank(operator);
        escrow.submitStage(2, keccak256("e"));
        uint256 deadline = block.timestamp + 10;
        bytes32 digest = escrow.hashClientApprove(2, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadSignature.selector);
        escrow.clientApproveWithSig(2, deadline, abi.encodePacked(r, s, v));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadSignature.selector);
        escrow.clientApproveWithSig(2, deadline, hex"01");
    }

    function test_disputeLocksReleaseAndConsultantSplits() public {
        _accept();
        _fund(0);
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.dispute(0, keccak256("reason"));
        vm.prank(client);
        vm.expectRevert(CertaEscrow.EmptyReason.selector);
        escrow.dispute(0, bytes32(0));
        vm.prank(client);
        escrow.dispute(0, keccak256("reason"));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.releaseStage(0);
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.resolveDispute(0, 5_000);
        vm.prank(consultant);
        vm.expectRevert(CertaEscrow.BadBps.selector);
        escrow.resolveDispute(0, 10_001);

        uint256 beforeClient = token.balanceOf(client);
        vm.prank(consultant);
        escrow.resolveDispute(0, 5_000);
        // gross 500_000, retention 5% = 25_000, payout 475_000, refund 500_000
        assertEq(token.balanceOf(contractor), 475_000);
        assertEq(token.balanceOf(client), beforeClient + 500_000);
        assertEq(escrow.retentionOutstanding(), 25_000);
        vm.prank(consultant);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.resolveDispute(0, 1_000);
    }

    function test_contractorCanDisputeFundedStage() public {
        _accept();
        _fund(0);
        vm.prank(contractor);
        escrow.dispute(0, keccak256("stop"));
        (,, CertaEscrow.StageStatus status,,,,) = escrow.stages(0);
        assertEq(uint256(status), uint256(CertaEscrow.StageStatus.Disputed));
    }

    function test_offlineSettlementNeedsBothSignatures() public {
        _accept();
        _fund(0);
        vm.prank(contractor);
        escrow.dispute(0, keccak256("talk"));
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = escrow.hashResolve(0, 2_500, deadline);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(clientPk, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(contractorPk, digest);
        vm.prank(operator);
        escrow.resolveDisputeWithSigs(0, 2_500, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2));
        assertGt(token.balanceOf(contractor), 0);

        _accept();
        // fresh path: wrong signer
        CertaEscrow fresh = _deploy(address(token), _amounts3(), 500, 0, CAP, 10 days);
        vm.prank(client);
        fresh.acceptTerms();
        vm.prank(contractor);
        fresh.acceptTerms();
        _fundOn(fresh, 0);
        vm.prank(client);
        fresh.dispute(0, keccak256("x"));
        bytes32 bad = fresh.hashResolve(0, 1000, deadline);
        (uint8 bv, bytes32 br, bytes32 bs) = vm.sign(operatorPk, bad);
        (uint8 cv, bytes32 cr, bytes32 cs) = vm.sign(contractorPk, bad);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.BadSignature.selector);
        fresh.resolveDisputeWithSigs(0, 1000, deadline, abi.encodePacked(br, bs, bv), abi.encodePacked(cr, cs, cv));
    }

    function test_retentionTiming() public {
        _accept();
        _fund(0);
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(operator);
        escrow.releaseStage(0);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.DefectsPeriodActive.selector);
        escrow.releaseRetention();
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.startDefectsPeriod();
        vm.prank(client);
        escrow.startDefectsPeriod();
        vm.prank(consultant);
        vm.expectRevert(CertaEscrow.AlreadyStarted.selector);
        escrow.startDefectsPeriod();
        vm.prank(client);
        vm.expectRevert(CertaEscrow.DefectsPeriodActive.selector);
        escrow.releaseRetention();
        vm.warp(block.timestamp + 180 days);
        uint256 held = escrow.retentionOutstanding();
        vm.prank(consultant);
        escrow.releaseRetention();
        assertEq(escrow.totalRetentionReleased(), held);
        assertEq(escrow.retentionOutstanding(), 0);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.NothingToRelease.selector);
        escrow.releaseRetention();
    }

    function test_variationNeedsBothSignatures() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 amount = 750_000;
        bytes32 digest = escrow.hashVariation(amount, 500, 0, deadline);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(clientPk, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(contractorPk, digest);
        vm.prank(operator);
        escrow.addVariation(amount, 500, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2));
        assertEq(escrow.stageCount(), 4);
        assertEq(escrow.variationNonce(), 1);

        (uint8 v3, bytes32 r3, bytes32 s3) = vm.sign(clientPk, escrow.hashVariation(amount, 500, 1, deadline));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadSignature.selector);
        escrow.addVariation(amount, 500, deadline, abi.encodePacked(r3, s3, v3), abi.encodePacked(r3, s3, v3));

        vm.prank(operator);
        vm.expectRevert(CertaEscrow.ZeroAmount.selector);
        escrow.addVariation(0, 500, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadBps.selector);
        escrow.addVariation(1, 10_001, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2));
    }

    function test_cancelRefundsUnsubmittedAndLeavesDisputed() public {
        _accept();
        _fund(2);
        vm.prank(operator);
        escrow.releaseMobilisation();
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(contractor);
        escrow.dispute(1, keccak256("no"));
        uint256 before = token.balanceOf(client);
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.cancel();
        vm.prank(client);
        uint256 refunded = escrow.cancel();
        // stage 2 (3_000_000) refunded. mobilisation already released. stage 0 submitted, stage 1 disputed.
        assertEq(refunded, 3_000_000);
        assertEq(token.balanceOf(client), before + 3_000_000);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.CancelledProject.selector);
        escrow.submitStage(0, keccak256("again"));
        vm.prank(client);
        vm.expectRevert(CertaEscrow.NothingToRefund.selector);
        escrow.refundUnfunded();
    }

    function test_refundUnfundedWithoutCancellingProject() public {
        _accept();
        _fund(0);
        vm.prank(operator);
        uint256 refunded = escrow.refundUnfunded();
        assertEq(refunded, 1_000_000);
        assertFalse(escrow.cancelled());
        // mobilisation stays funded
        vm.prank(operator);
        escrow.releaseMobilisation();
        assertEq(token.balanceOf(contractor), MOB);
    }

    function test_pauseBlocksMoneyMovementButNotDispute() public {
        _accept();
        vm.prank(stranger);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.pause();
        vm.prank(admin);
        escrow.pause();
        uint256 pausedQuote = escrow.quoteFund(0);
        vm.prank(client);
        vm.expectRevert();
        escrow.fund(pausedQuote, 0);
        vm.prank(admin);
        escrow.unpause();
        _fund(0);
        vm.prank(admin);
        escrow.pause();
        vm.prank(client);
        escrow.dispute(0, keccak256("during-pause"));
        (,, CertaEscrow.StageStatus status,,,,) = escrow.stages(0);
        assertEq(uint256(status), uint256(CertaEscrow.StageStatus.Disputed));
    }

    function test_feeOnTransferRejected() public {
        FeeToken fee = new FeeToken();
        CertaEscrow feeEscrow = _deploy(address(fee), _amounts3(), 500, 0, CAP, 10 days);
        vm.prank(client);
        feeEscrow.acceptTerms();
        vm.prank(contractor);
        feeEscrow.acceptTerms();
        uint256 amount = feeEscrow.quoteFund(0);
        fee.mint(client, amount);
        vm.prank(client);
        fee.approve(address(feeEscrow), amount);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.FeeOnTransfer.selector);
        feeEscrow.fund(amount, 0);
    }

    function test_reentrancyOnReleaseAndFund() public {
        MaliciousToken mal = new MaliciousToken();
        CertaEscrow malEscrow = _deploy(address(mal), _amounts3(), 500, 0, type(uint256).max, 10 days);
        vm.prank(client);
        malEscrow.acceptTerms();
        vm.prank(contractor);
        malEscrow.acceptTerms();
        uint256 amount = malEscrow.quoteFund(0);
        mal.mint(client, amount);
        vm.prank(client);
        mal.approve(address(malEscrow), amount);
        vm.prank(client);
        malEscrow.fund(amount, 0);
        vm.prank(operator);
        malEscrow.submitStage(0, keccak256("e"));
        mal.arm(address(malEscrow), 0, true, false);
        vm.prank(operator);
        vm.expectRevert(bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        malEscrow.releaseStage(0);

        mal.arm(address(malEscrow), 0, false, true);
        uint256 more = malEscrow.quoteFund(1);
        mal.mint(client, more);
        vm.prank(client);
        mal.approve(address(malEscrow), more);
        vm.prank(client);
        vm.expectRevert(bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        malEscrow.fund(more, 1);
    }

    function test_ethRejectedAndStageRange() public {
        (bool ok,) = address(escrow).call{value: 1 ether}("");
        assertFalse(ok);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.StageOutOfRange.selector);
        escrow.submitStage(9, keccak256("e"));
        vm.prank(client);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.dispute(0, keccak256("early"));
    }

    function test_solvencyAndContractorCapOnHappyPath() public {
        _accept();
        _fund(2);
        vm.prank(operator);
        escrow.releaseMobilisation();
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(client);
        escrow.clientApprove(2);
        vm.prank(operator);
        escrow.submitStage(1, keccak256("e"));
        vm.prank(operator);
        escrow.submitStage(2, keccak256("e"));
        vm.prank(operator);
        escrow.releaseStage(0);
        vm.prank(operator);
        escrow.releaseStage(1);
        vm.prank(operator);
        escrow.releaseStage(2);
        assertEq(token.balanceOf(address(escrow)), escrow.expectedBalance());
        assertLe(escrow.paidToContractor(), escrow.maxContractorReceivable());
        assertEq(escrow.paidToContractor() + escrow.retentionOutstanding(), MOB + 1_000_000 + 2_000_000 + 3_000_000);
    }

    function testFuzz_splitConservesAmount(uint96 amount, uint16 bps) public {
        amount = uint96(bound(amount, 1, 1e15));
        bps = uint16(bound(bps, 0, 10_000));
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        CertaEscrow local = _deploy(address(token), amounts, bps, 0, type(uint256).max, 1);
        vm.prank(client);
        local.acceptTerms();
        vm.prank(contractor);
        local.acceptTerms();
        uint256 quote = local.quoteFund(0);
        token.mint(client, quote);
        vm.prank(client);
        token.approve(address(local), quote);
        vm.prank(client);
        local.fund(quote, 0);
        vm.prank(operator);
        local.submitStage(0, keccak256("fuzz"));
        vm.prank(operator);
        local.releaseStage(0);
        uint256 retention = (uint256(amount) * bps) / 10_000;
        assertEq(token.balanceOf(address(local)), retention);
        assertEq(local.paidToContractor(), uint256(amount) - retention);
        assertEq(token.balanceOf(address(local)), local.expectedBalance());
        assertLe(local.paidToContractor(), local.maxContractorReceivable());
    }

    /// @dev Stage numbers in the brief are 1-based. `fund`/`releaseStage` indexes are 0-based, so stage 5 is index 4.
    function test_fullLifecycle() public {
        uint256[] memory amounts = new uint256[](5);
        amounts[0] = 2_000_000;
        amounts[1] = 3_000_000;
        amounts[2] = 7_000_000;
        amounts[3] = 5_000_000;
        amounts[4] = 3_000_000;
        CertaEscrow life = _deploy(address(token), amounts, 500, 0, 5_000_000, 180 days);
        vm.prank(client);
        life.acceptTerms();
        vm.prank(contractor);
        life.acceptTerms();
        uint256 quote = life.quoteFund(4);
        assertEq(quote, 20_000_000);
        token.mint(client, quote);
        vm.startPrank(client);
        token.approve(address(life), quote);
        life.fund(quote, 4);
        vm.stopPrank();

        vm.prank(operator);
        life.submitStage(0, keccak256("stage-1"));
        vm.prank(operator);
        life.releaseStage(0);
        assertEq(token.balanceOf(contractor), 1_900_000);
        assertEq(life.retentionOutstanding(), 100_000);

        vm.prank(operator);
        life.submitStage(1, keccak256("stage-2"));
        vm.prank(operator);
        life.releaseStage(1);

        vm.prank(operator);
        life.submitStage(2, keccak256("stage-3"));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.CapExceeded.selector);
        life.releaseStage(2);
        vm.prank(client);
        life.clientApprove(2);
        vm.prank(operator);
        life.releaseStage(2);

        vm.prank(client);
        life.startDefectsPeriod();
        vm.warp(life.defectsPeriodEnd());
        uint256 retention = life.retentionOutstanding();
        uint256 contractorBefore = token.balanceOf(contractor);
        vm.prank(consultant);
        life.releaseRetention();
        assertEq(token.balanceOf(contractor), contractorBefore + retention);
        assertEq(token.balanceOf(address(life)), life.expectedBalance());
        assertEq(life.paidToContractor() + token.balanceOf(address(life)), 20_000_000);
    }

    function test_partialFunding() public {
        _accept();
        _fund(0);
        (,, CertaEscrow.StageStatus first,,,,) = escrow.stages(0);
        (,, CertaEscrow.StageStatus second,,,,) = escrow.stages(1);
        assertEq(uint256(first), uint256(CertaEscrow.StageStatus.Funded));
        assertEq(uint256(second), uint256(CertaEscrow.StageStatus.Pending));
        uint256 more = escrow.quoteFund(2);
        assertGt(more, 0);
        _fund(2);
        assertEq(escrow.quoteFund(2), 0);
        vm.prank(client);
        vm.expectRevert(CertaEscrow.ZeroAmount.selector);
        escrow.fund(1, 2);
    }

    function test_cannotReleaseUnfunded() public {
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.releaseStage(0);
    }

    function test_cannotDoubleRelease() public {
        _accept();
        _fund(0);
        vm.prank(operator);
        escrow.submitStage(0, keccak256("once"));
        vm.prank(operator);
        escrow.releaseStage(0);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.releaseStage(0);
    }

    function test_onlyOperatorSubmits() public {
        _accept();
        _fund(0);
        vm.prank(contractor);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(client);
        vm.expectRevert(CertaEscrow.NotAuthorized.selector);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
    }

    function test_disputeBlocksRelease() public {
        _accept();
        _fund(0);
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(client);
        escrow.dispute(0, keccak256("hold"));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.releaseStage(0);
    }

    function test_resolveDisputeWithSigs() public {
        _accept();
        _fund(0);
        vm.prank(client);
        escrow.dispute(0, keccak256("split"));
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = escrow.hashResolve(0, 5_000, deadline);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(clientPk, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(contractorPk, digest);
        vm.prank(operator);
        escrow.resolveDisputeWithSigs(
            0, 5_000, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2)
        );
        (,, CertaEscrow.StageStatus status,,,,) = escrow.stages(0);
        assertEq(uint256(status), uint256(CertaEscrow.StageStatus.Released));
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadStatus.selector);
        escrow.resolveDisputeWithSigs(
            0, 5_000, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2)
        );
    }

    function test_clientApproveWithSig_replay_reverts() public {
        _accept();
        _fund(2);
        vm.prank(operator);
        escrow.submitStage(2, keccak256("e"));
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = escrow.hashClientApprove(2, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(clientPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(operator);
        escrow.clientApproveWithSig(2, deadline, sig);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.AlreadyApproved.selector);
        escrow.clientApproveWithSig(2, deadline, sig);

        CertaEscrow other = _deploy(address(token), _amounts3(), 500, 0, CAP, 10 days);
        vm.prank(operator);
        vm.expectRevert(CertaEscrow.BadSignature.selector);
        other.clientApproveWithSig(2, deadline, sig);
    }

    function test_variationNeedsBothSigs() public {
        _accept();
        _fund(0);
        vm.prank(operator);
        escrow.submitStage(0, keccak256("e"));
        vm.prank(operator);
        escrow.releaseStage(0);
        (uint256 releasedAmount,,,,,,) = escrow.stages(0);
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = escrow.hashVariation(100_000, 500, escrow.variationNonce(), deadline);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(clientPk, digest);
        vm.expectRevert(CertaEscrow.BadSignature.selector);
        escrow.addVariation(100_000, 500, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r1, s1, v1));
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(contractorPk, digest);
        escrow.addVariation(100_000, 500, deadline, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2));
        (uint256 unchanged,,,,,,) = escrow.stages(0);
        assertEq(unchanged, releasedAmount);
        assertEq(escrow.stageCount(), 4);
    }

    function test_refundUnfunded() public {
        _accept();
        _fund(0);
        uint256 before = token.balanceOf(client);
        vm.prank(client);
        uint256 refunded = escrow.refundUnfunded();
        assertEq(refunded, 1_000_000);
        assertEq(token.balanceOf(client), before + refunded);
        assertEq(token.balanceOf(address(escrow)), MOB);
        (,, CertaEscrow.StageStatus status,,,,) = escrow.stages(0);
        assertEq(uint256(status), uint256(CertaEscrow.StageStatus.Cancelled));
        (,, CertaEscrow.StageStatus later,,,,) = escrow.stages(1);
        assertEq(uint256(later), uint256(CertaEscrow.StageStatus.Pending));
    }

    function testFuzz_retentionMaths(uint64 amount, uint16 bps) public {
        amount = uint64(bound(amount, 1, type(uint64).max));
        bps = uint16(bound(bps, 0, 1000));
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        CertaEscrow local = _deploy(address(token), amounts, bps, 0, type(uint256).max, 1);
        vm.prank(client);
        local.acceptTerms();
        vm.prank(contractor);
        local.acceptTerms();
        token.mint(client, amount);
        vm.startPrank(client);
        token.approve(address(local), amount);
        local.fund(amount, 0);
        vm.stopPrank();
        vm.prank(operator);
        local.submitStage(0, keccak256("fuzz-retention"));
        uint256 before = token.balanceOf(contractor);
        vm.prank(operator);
        local.releaseStage(0);
        uint256 retention = (uint256(amount) * bps) / 10_000;
        uint256 payout = token.balanceOf(contractor) - before;
        assertEq(payout, uint256(amount) - retention);
        assertEq(local.retentionOutstanding(), retention);
        assertEq(payout + local.retentionOutstanding(), uint256(amount));
    }

    function _accept() internal {
        vm.prank(client);
        escrow.acceptTerms();
        vm.prank(contractor);
        escrow.acceptTerms();
    }

    function _fund(uint8 upTo) internal {
        _fundOn(escrow, upTo);
    }

    function _fundOn(CertaEscrow target, uint8 upTo) internal {
        uint256 amount = target.quoteFund(upTo);
        _mintApproveTo(target, amount);
        vm.prank(client);
        target.fund(amount, upTo);
    }

    function _mintApprove(uint256 amount) internal {
        _mintApproveTo(escrow, amount);
    }

    function _mintApproveTo(CertaEscrow target, uint256 amount) internal {
        token.mint(client, amount);
        vm.prank(client);
        token.approve(address(target), amount);
    }

    function _amounts3() internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](3);
        amounts[0] = 1_000_000;
        amounts[1] = 2_000_000;
        amounts[2] = 3_000_000;
    }

    function _params(address token_, uint256[] memory amounts, uint16 bps, uint256 mob, uint256 cap)
        internal
        view
        returns (CertaEscrow.InitParams memory)
    {
        return CertaEscrow.InitParams({
            client: client,
            contractor: contractor,
            consultant: consultant,
            operator: operator,
            admin: admin,
            token: token_,
            stageAmounts: amounts,
            retentionBps: bps,
            mobilisationAmount: mob,
            spendingCap: cap,
            termsHash: terms,
            defectsPeriodSeconds: 180 days,
            projectId: projectId
        });
    }

    function _deploy(
        address token_,
        uint256[] memory amounts,
        uint16 bps,
        uint256 mob,
        uint256 cap,
        uint64 defects
    ) internal returns (CertaEscrow instance) {
        CertaEscrow.InitParams memory params = _params(token_, amounts, bps, mob, cap);
        params.defectsPeriodSeconds = defects;
        params.projectId = keccak256(abi.encodePacked(projectId, token_, amounts.length, mob, cap, bps, gasleft()));
        instance = CertaEscrow(payable(factory.createEscrow(params)));
    }

    function _expectCreateRevert(CertaEscrow.InitParams memory params) internal {
        params.projectId = keccak256(abi.encodePacked("bad", gasleft(), params.retentionBps));
        vm.expectRevert();
        factory.createEscrow(params);
    }
}
