// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {CertaEscrow} from "./CertaEscrow.sol";

/// @notice Deploys one minimal proxy per project. The registry is for discovery, not custody.
contract EscrowFactory {
    address public immutable implementation;
    address[] public allEscrows;
    mapping(bytes32 => address) public escrowByProject;

    event EscrowCreated(address indexed escrow, bytes32 indexed projectId, address indexed client);

    error ZeroAddress();
    error ProjectExists();

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ZeroAddress();
        implementation = implementation_;
    }

    function createEscrow(CertaEscrow.InitParams calldata params) external returns (address escrow) {
        if (params.projectId == bytes32(0)) revert ZeroAddress();
        if (escrowByProject[params.projectId] != address(0)) revert ProjectExists();
        escrow = Clones.clone(implementation);
        CertaEscrow(payable(escrow)).initialize(params);
        allEscrows.push(escrow);
        escrowByProject[params.projectId] = escrow;
        emit EscrowCreated(escrow, params.projectId, params.client);
    }

    function escrowCount() external view returns (uint256) {
        return allEscrows.length;
    }
}
