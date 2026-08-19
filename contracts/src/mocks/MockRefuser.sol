// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Un portofel care refuza ETH.
 *
 * Exista ca sa dovedeasca o singura regula: un agent cu portofel prost nu are
 * voie sa opreasca munca intregii flote. Fara el, testul ar trece pentru ca
 * toate portofelele din test sunt cuminti, si am afla de problema in
 * productie, cand un cumparator isi muta agentul intr-un contract ciudat.
 */
contract MockRefuser {
    error NoThanks();

    receive() external payable {
        revert NoThanks();
    }
}
