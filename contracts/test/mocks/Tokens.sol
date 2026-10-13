// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CertaEscrow} from "../../src/CertaEscrow.sol";

contract TestUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        uint256 fee = value / 100;
        super.transfer(to, value - fee);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        uint256 fee = value / 100;
        super.transferFrom(from, to, value - fee);
        return true;
    }
}

contract MaliciousToken is ERC20 {
    CertaEscrow public escrow;
    bool public attackOnTransfer;
    bool public attackOnTransferFrom;
    uint256 public attackStage;

    constructor() ERC20("Mal", "MAL") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address escrow_, uint256 stage_, bool onTransfer, bool onFrom) external {
        escrow = CertaEscrow(payable(escrow_));
        attackStage = stage_;
        attackOnTransfer = onTransfer;
        attackOnTransferFrom = onFrom;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        bool ok = super.transfer(to, value);
        if (attackOnTransfer) {
            attackOnTransfer = false;
            escrow.releaseStage(attackStage);
        }
        return ok;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        bool ok = super.transferFrom(from, to, value);
        if (attackOnTransferFrom) {
            attackOnTransferFrom = false;
            escrow.releaseStage(attackStage);
        }
        return ok;
    }
}
