# Microtick Stargate Upgrade

If you've been monitoring this channel, you're aware of the fact that Microtick will be upgrading to Stargate commencing this Thursday https://github.com/microtick/governance/blob/master/proposal7.md.  Here's what to know / expect.

## Upgrade Notes:

1.  Thursday, July 29th at 3 pm UTC.  microtickzone-a2 chain halt.  Validators will shut down their nodes.

2.  State export.  The last block on microtickzone-a2 with a consensus timestamp prior to the cutoff time will be the height of the state export to be used as a reference for the IBC / Stargate migration.

2.  Account balances.  We will be providing an upgrade script that migrates accounts from the old format to the new.  This is not integrated into the binary.  Instead there is a javascript upgrade script we will be sharing that implements the cosmos F1 fee distribution algorithm https://drops.dagstuhl.de/opus/volltexte/2020/11974/pdf/OASIcs-Tokenomics-2019-10.pdf and will be used to calculate account balances (including balance, bonded tokens, unbonding tokens, outstanding and historical rewards, and slashing).

3.  Supply adjustment.  There are slight differences in the calculations described above from what is calculated by the current mtcli binary.  Right now the difference is approximately 50 cents out of the total 250K DAI float.  Rather than debug the differences, if the resulting supply on the new chain is too large, Microtick will take the difference out of its own account for both TICK and DAI in order to make the supplies match.  If the resulting supply is too small, the community pool will be incremented to make up the difference for TICK and DAI.  These adjustments will be part of the conversion script.

4.  Existing markets, time durations, governance parameters, etc. will be copied across as currently specified.

5.  The new genesis time (August 2nd at 3 pm UTC) and chain ID (microtick-1) will be added by the conversion script.

## Action Items:

1.  Validators MUST shut down their nodes within 100 blocks of the microtickzone-a2 halt time of July 29, 2021 3pm UTC.

2.  Validators that want to validate on the IBC-enabled chain MUST execute the conversion script to obtain a new genesis file.  New validators who have TICK balances MAY join as genesis validators during this step (see action item 3).

```
$ mtd export --height <last block height before cutoff> --for-zero-height | jq . > state.json
$ node convert state.json
$ jq -S -c -M '' genesis.json | shasum -a 256
<hash value checksum printed here>
```

This will generate the genesis.json automatically.

3.  All community members will have a 24 hour window from July 29, 3pm UTC through July 30, 3 pm UTC to check their account balances in the new genesis.json and report any inaccuracies. Note that all delegations are withdrawn by the conversion script and become part of the account balance.

4.  Validators who want to be on the genesis block MUST sign a new gentx and submit it as a pull request to https://github.com/microtick/stargate-genesis before July 31, 2021 at 3pm UTC.  This gives a 24 hour window for the community to come to consensus on the new genesis.json and handle any account balance disputes, then 24 hours for validators to sign the gentx PR's.

5.  Validators who submitted gentx's to be included in the chain start MUST update their genesis.json to the final one, which will be posted very soon after August 1, 2021 at 3 pm UTC.  Upon updating, validators SHOULD start their nodes.  There will be a 24 hour window for this process to complete.
