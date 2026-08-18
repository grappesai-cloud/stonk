// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Registrul ERC-6551, scris pe litera specificatiei.
 *
 * Codul contului e un proxy minimal (ERC-1167) cu 128 de octeti de date lipite
 * la coada: salt, chainId, tokenContract, tokenId. De aici vine proprietatea de
 * care depinde tot Courier-ul: adresa portofelului unui NFT se poate calcula
 * offline, fara sa citesti nimic si fara ca portofelul sa fie desfasurat.
 */
contract ERC6551Registry {
    event ERC6551AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    error AccountCreationFailed();

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address) {
        bytes memory code = _creationCode(implementation, salt, chainId, tokenContract, tokenId);
        address predicted = _compute(keccak256(code), salt);

        if (predicted.code.length != 0) return predicted;

        address deployed;
        assembly {
            deployed := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (deployed == address(0)) revert AccountCreationFailed();

        emit ERC6551AccountCreated(deployed, implementation, salt, chainId, tokenContract, tokenId);
        return deployed;
    }

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address) {
        return _compute(keccak256(_creationCode(implementation, salt, chainId, tokenContract, tokenId)), salt);
    }

    function _creationCode(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3",
            salt,
            chainId,
            // adresa se lipeste pe 32 de octeti, nu pe 20. abi.encodePacked
            // ar taia-o la 20 si ar iesi alta adresa decat cea din specificatie.
            uint256(uint160(tokenContract)),
            tokenId
        );
    }

    function _compute(bytes32 codeHash, bytes32 salt) internal view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }
}
