// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CertaEscrow} from "../src/CertaEscrow.sol";
import {EscrowFactory} from "../src/EscrowFactory.sol";

/// @notice Ethereum Sepolia deploy. Records addresses in the broadcast log.
///         forge script script/Deploy.s.sol:DeployScript --rpc-url $SEPOLIA_RPC_URL --broadcast --slow
contract DeployScript is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        vm.startBroadcast(pk);
        CertaEscrow impl = new CertaEscrow();
        EscrowFactory factory = new EscrowFactory(address(impl));
        vm.stopBroadcast();
        console2.log("Implementation", address(impl));
        console2.log("Factory", address(factory));
        console2.log("USDC", usdc);
        console2.log("Chain", block.chainid);
    }
}
