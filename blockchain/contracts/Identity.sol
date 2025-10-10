// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Identity {
    string public name = "Credential Vault Identity";
    
    function getName() public view returns (string memory) {
        return name;
    }
}
