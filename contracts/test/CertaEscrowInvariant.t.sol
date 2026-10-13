// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CertaEscrow} from "../src/CertaEscrow.sol";
import {EscrowFactory} from "../src/EscrowFactory.sol";
import {TestUSDC} from "./mocks/Tokens.sol";

contract EscrowHandler is Test {
    CertaEscrow public escrow;
    TestUSDC public token;
    address public client;
    uint256 public clientPk;
    address public contractor;
    uint256 public contractorPk;
    address public consultant;
    address public operator;

    constructor(CertaEscrow escrow_, TestUSDC token_, address client_, uint256 clientPk_, address contractor_, uint256 contractorPk_, address consultant_, address operator_) {
        escrow = escrow_;
        token = token_;
        client = client_;
        clientPk = clientPk_;
        contractor = contractor_;
        contractorPk = contractorPk_;
        consultant = consultant_;
        operator = operator_;
    }

    function fund(uint8 upTo) external {
        if (escrow.cancelled()) return;
        if (!escrow.clientAccepted()) {
            vm.prank(client);
            escrow.acceptTerms();
        }
        if (!escrow.contractorAccepted()) {
            vm.prank(contractor);
            escrow.acceptTerms();
        }
        uint256 n = escrow.stageCount();
        if (n == 0) return;
        upTo = uint8(bound(upTo, 0, uint8(n - 1)));
        uint256 expected = escrow.quoteFund(upTo);
        if (expected == 0) return;
        token.mint(client, expected);
        vm.startPrank(client);
        token.approve(address(escrow), expected);
        try escrow.fund(expected, upTo) {} catch {}
        vm.stopPrank();
    }

    function submitAndMaybeRelease(uint8 index, bool approve) external {
        uint256 n = escrow.stageCount();
        if (n == 0) return;
        index = uint8(bound(index, 0, uint8(n - 1)));
        (uint256 amount,, CertaEscrow.StageStatus status,,,,) = escrow.stages(index);
        if (status == CertaEscrow.StageStatus.Funded) {
            vm.prank(operator);
            try escrow.submitStage(index, keccak256(abi.encode(index, amount))) {} catch {}
        }
        (,, status,,,,) = escrow.stages(index);
        if (status != CertaEscrow.StageStatus.Submitted) return;
        if (amount > escrow.spendingCap() && approve) {
            vm.prank(client);
            try escrow.clientApprove(index) {} catch {}
        }
        vm.prank(operator);
        try escrow.releaseStage(index) {} catch {}
    }

    function disputeAndResolve(uint8 index, uint16 payBps) external {
        uint256 n = escrow.stageCount();
        if (n == 0) return;
        index = uint8(bound(index, 0, uint8(n - 1)));
        (,, CertaEscrow.StageStatus status,,,,) = escrow.stages(index);
        if (status == CertaEscrow.StageStatus.Funded || status == CertaEscrow.StageStatus.Submitted) {
            vm.prank(client);
            try escrow.dispute(index, keccak256("inv")) {} catch {}
        }
        payBps = uint16(bound(payBps, 0, 10_000));
        vm.prank(consultant);
        try escrow.resolveDispute(index, payBps) {} catch {}
    }

    function releaseMobilisation() external {
        vm.prank(operator);
        try escrow.releaseMobilisation() {} catch {}
    }
}

contract CertaEscrowInvariantTest is Test {
    TestUSDC internal token;
    CertaEscrow internal escrow;
    EscrowHandler internal handler;

    function setUp() public {
        (address client, uint256 clientPk) = makeAddrAndKey("client");
        (address contractor, uint256 contractorPk) = makeAddrAndKey("contractor");
        address consultant = makeAddr("consultant");
        address operator = makeAddr("operator");
        address admin = makeAddr("admin");
        token = new TestUSDC();
        CertaEscrow impl = new CertaEscrow();
        EscrowFactory factory = new EscrowFactory(address(impl));
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1_000_000;
        amounts[1] = 4_000_000;
        amounts[2] = 2_000_000;
        escrow = CertaEscrow(payable(
            factory.createEscrow(
                CertaEscrow.InitParams({
                    client: client,
                    contractor: contractor,
                    consultant: consultant,
                    operator: operator,
                    admin: admin,
                    token: address(token),
                    stageAmounts: amounts,
                    retentionBps: 500,
                    mobilisationAmount: 250_000,
                    spendingCap: 3_000_000,
                    termsHash: keccak256("terms"),
                    defectsPeriodSeconds: 30 days,
                    projectId: keccak256("inv-project")
                })
            )
        ));
        handler = new EscrowHandler(escrow, token, client, clientPk, contractor, contractorPk, consultant, operator);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.fund.selector;
        selectors[1] = handler.submitAndMaybeRelease.selector;
        selectors[2] = handler.disputeAndResolve.selector;
        selectors[3] = handler.releaseMobilisation.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_solvency() public view {
        assertEq(token.balanceOf(address(escrow)), escrow.expectedBalance());
    }

    function invariant_contractorCap() public view {
        assertLe(escrow.paidToContractor(), escrow.maxContractorReceivable());
    }
}
