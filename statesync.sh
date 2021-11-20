#!/bin/bash
set -e

if [[ "$#" -ne 1 ]]; then
    BASE=$(basename $0)
    echo "Usage: $BASE: <moniker>"
    exit 1
fi
MONIKER=$1

if [ -e $HOME/.microtick ]; then
    echo "$HOME/.microtick exists: remove or back it up first"
    exit 1
fi

# Test if mtm is in path
mtm --help > /dev/null 2>&1
MTM_RESULT=$?
if [ $MTM_RESULT -ne 0 ]; then
    echo "mtm: not found"
    exit 1
fi

mtm init $MONIKER > /dev/null 2>&1
cp ./genesis.json $HOME/.microtick/config

# get trust height
INTERVAL=1000
LATEST_HEIGHT=$(curl -s "http://45.79.207.112:26657/block" | jq -r .result.block.header.height)
TRUST_HEIGHT=$(($(($LATEST_HEIGHT / $INTERVAL)) * $INTERVAL))
echo TRUST_HEIGHT=$TRUST_HEIGHT

# get trust hash
TRUST_HASH=$(curl -s "http://45.79.207.112:26657/block?height=$TRUST_HEIGHT" | jq -r .result.block_id.hash)
echo TRUST_HASH=$TRUST_HASH

sed -i.bak -E "s|^(enable[[:space:]]+=[[:space:]]+).*$|\1true| ; \
s|^(rpc_servers[[:space:]]+=[[:space:]]+).*$|\1\"http://104.237.158.143:26657,http://45.56.73.136:26657,http://139.162.196.54:26657\"| ; \
s|^(trust_height[[:space:]]+=[[:space:]]+).*$|\1$TRUST_HEIGHT| ; \
s|^(trust_hash[[:space:]]+=[[:space:]]+).*$|\1\"$TRUST_HASH\"| ; \
s|^(seeds[[:space:]]+=[[:space:]]+).*$|\1\"e8466c961788f68803d873c28b6a0f843b36ba3e@45.79.207.112:26656,885cc6b8bcc36d9fd0489f4bfa2d845c9b60f354@5.189.132.164:26656,f1b27c43f32b68710de06d8e0fb13e7c9cc21ed2@168.119.231.242:26656\"|" $HOME/.microtick/config/config.toml

mtm start
