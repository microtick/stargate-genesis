#!/bin/bash
set -e

BACKUP_DIR=$HOME/.microtick.backup
DATE_BACKUP=`date +"%d_%m_%Y-%H_%M_%S"`

# Test if mtm is in path
mtm --help > /dev/null 2>&1
MTM_RESULT=$?
if [ $MTM_RESULT -ne 0 ]; then
    echo "mtm: executable not found, please download the latest from here: https://microtick.com/releases/mainnet/"
    exit 1
fi

if [ -d $HOME/.microtick ]; then
    echo "Backing up $HOME/.microtick because it already exists"
    echo "Backup will be here: $BACKUP_DIR"
    mkdir -p $BACKUP_DIR
    tar cvfz $BACKUP_DIR/microtick_folder_backup_$DATE_BACKUP.tgz -C $HOME/.microtick --exclude="./data/cs.wal" --exclude="./data/application.db" --exclude="./data/blockstore.db" --exclude="./data/evidence.db" --exclude="./data/snapshots" --exclude="./data/state.db" --exclude="./data/tx_index.db" .
    echo
    mtm unsafe-reset-all
else
    if [[ "$#" -ne 1 ]]; then
        BASE=$(basename $0)
        echo "When starting a node for the first time, you should choose a moniker"
	echo "usage: $BASE: <moniker>"
        exit 1
    fi
    MONIKER=$1
    mtm init $MONIKER > /dev/null 2>&1
    cp ./genesis.json $HOME/.microtick/config
fi

# get trust height
INTERVAL=1000
LATEST_HEIGHT=$(curl -s "http://45.79.207.112:26657/block" | jq -r .result.block.header.height)
TRUST_HEIGHT=$(($(($LATEST_HEIGHT / $INTERVAL)) * $INTERVAL))
echo
echo TRUST_HEIGHT=$TRUST_HEIGHT

# get trust hash
TRUST_HASH=$(curl -s "http://45.79.207.112:26657/block?height=$TRUST_HEIGHT" | jq -r .result.block_id.hash)
echo TRUST_HASH=$TRUST_HASH

sed -i.bak -E "s|^(enable[[:space:]]+=[[:space:]]+).*$|\1true| ; \
s|^(rpc_servers[[:space:]]+=[[:space:]]+).*$|\1\"http://104.237.158.143:26657,http://45.56.73.136:26657,http://139.162.196.54:26657\"| ; \
s|^(trust_height[[:space:]]+=[[:space:]]+).*$|\1$TRUST_HEIGHT| ; \
s|^(trust_hash[[:space:]]+=[[:space:]]+).*$|\1\"$TRUST_HASH\"| ; \
s|^(seeds[[:space:]]+=[[:space:]]+).*$|\1\"e8466c961788f68803d873c28b6a0f843b36ba3e@45.79.207.112:26656,885cc6b8bcc36d9fd0489f4bfa2d845c9b60f354@5.189.132.164:26656,f1b27c43f32b68710de06d8e0fb13e7c9cc21ed2@168.119.231.242:26656\"|" $HOME/.microtick/config/config.toml

echo 
echo "Setup complete"
echo "Next, run 'mtm start' from the command line, or configure a systemd service to do it."
