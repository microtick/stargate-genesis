const fs = require('fs')
const cp = require('child_process')
const { bech32 } = require('bech32')

const filename = process.argv[2]
const HOME = "./home"

const state = JSON.parse(fs.readFileSync(filename))

const env = {
  ...process.env,
  mtm_HOME: HOME
}

const execOptions = {
  env: env,
  stdio: 'ignore'
}

cp.execSync("rm -rf " + HOME)
cp.execSync("mtm init convert", execOptions)

// Calculate total validator stake

const validators = {}
state.app_state.distribution.delegator_starting_infos.map(del => {
  if (validators[del.validator_address] === undefined) {
    validators[del.validator_address] = {
      stake: 0,
      rewards: []
    }
  }
  validators[del.validator_address].stake += parseFloat(del.starting_info.stake)
})
state.app_state.distribution.validator_current_rewards.map(rew => {
  validators[rew.validator_address].rewards = rew.rewards.rewards
  validators[rew.validator_address].period = rew.rewards.period
})

// Combines two arrays of coin objects { denom, amount }
// Input: 2 arrays containing coin balances, combine newCoins into coins array.
const combineCoins = (addr, coins, newCoins) => {
  newCoins.map(coin => {
    const found = coins.reduce((acc, c) => {
      if (c.denom === coin.denom) {
        c.amount = "" + (parseInt(c.amount, 10) + parseInt(coin.amount, 10))
        return true
      }
      return acc
    }, false)
    if (!found) {
      coins.push(coin)
    }
  })
}

const getDai = ary => {
  return ary.reduce((acc, c) => {
    if (c.denom === "udai") {
      return c.amount
    }
    return acc
  }, 0)
}

const addStakedRewards = acct => {
  // Add back delegated tokens
  state.app_state.distribution.delegator_starting_infos.map(del => {
    if (del.delegator_address === acct.address) {
      //console.log("  Validator: " + del.validator_address)
      const period = parseInt(del.starting_info.previous_period, 10)
      const stake = parseFloat(del.starting_info.stake)
      //console.log("    Stake: " + stake + " / " + validators[del.validator_address].stake + " = " + (stake / validators[del.validator_address].stake))
      combineCoins(acct.address, acct.coins, [{ denom: "utick", amount: "" + Math.trunc(stake) }])
      // Historical rewards for this validator, delegator
      const hist_periods = state.app_state.distribution.validator_historical_rewards.reduce((acc, hr) => {
        if (hr.validator_address === del.validator_address) {
          acc.push(hr)
        }
        return acc
      }, []).sort((h1, h2) => {
        return parseInt(h1.period, 10) - parseInt(h2.period, 10)
      })
      var last = []
      const hist_rewards = hist_periods.reduce((acc, hist) => {
        if (parseInt(hist.period, 10) > period && hist.rewards.cumulative_reward_ratio !== null) {
          combineCoins(acct.address, acc, hist.rewards.cumulative_reward_ratio.map(r => {
            const lastRatio = last.reduce((acc, crr) => {
              if (crr.denom === r.denom) {
                acc = crr.amount
              }
              return acc
            }, 0)
            const effectiveRatio = parseFloat(r.amount) - parseFloat(lastRatio)
            return {
              amount: "" + Math.trunc(effectiveRatio * stake),
              denom: r.denom
            }
          }))
        }
        last = hist.rewards.cumulative_reward_ratio === null ? [] : hist.rewards.cumulative_reward_ratio
        return acc
      }, [])
      //console.log("    Historical: " + getDai(hist_rewards))
      combineCoins(acct.address, acct.coins, hist_rewards)
      var current_rewards = []
      // Current rewards
      if (validators[del.validator_address].rewards !== null) {
        current_rewards = validators[del.validator_address].rewards.map(r => {
          return {
            amount: "" + Math.trunc(parseFloat(r.amount) * (stake / validators[del.validator_address].stake)),
            denom: r.denom
          }
        })
        combineCoins(acct.address, acct.coins, current_rewards)
      }
      //console.log("    Current: " + getDai(current_rewards))
      //const sum = []
      //combineCoins("sum", sum, hist_rewards)
      //combineCoins("sum", sum, current_rewards)
      //console.log("    Total: " + getDai(sum))
    }
  })
  // Add back unbonding tokens
  state.app_state.staking.unbonding_delegations.map(del => {
    if (del.delegator_address === acct.address) {
      const amount = del.entries.reduce((acc, e) => {
        acc += parseInt(e.balance, 10)
        return acc
      }, 0)
      combineCoins(acct.address, acct.coins, [{ denom: "utick", amount: "" + amount }])
    }
  })
}

// Add genesis accounts with correct starting coin balances
state.app_state.bank.balances.map(acct => {
  //console.log()
  //console.log("Calculating tokens for " + acct.address)
  //console.log("  Bank: " + getDai(acct.coins))
  const atype = state.app_state.auth.accounts.reduce((acc, a) => {
    if (a.value.address === acct.address) {
      acc[0] = a.type
      acc[1] = a.value.name
    }
    return acc
  }, ["", ""])
  if (atype[0] === "cosmos-sdk/Account") {
    addStakedRewards(acct)
    // Add back commission if this account has a validator
    const decoded = bech32.decode(acct.address)
    const valoper = bech32.encode('microvaloper', decoded.words)
    const commission = state.app_state.distribution.validator_accumulated_commissions.reduce((acc, c) => {
      if (c.validator_address === valoper && c.accumulated.commission !== null) {
        acc = c.accumulated.commission.map(c => {
          return {
            denom: c.denom,
            amount: "" + Math.trunc(parseFloat(c.amount))
          }
        })
      }
      return acc
    }, [])
    //console.log("  Commission: " + getDai(commission))
    combineCoins(acct.address, acct.coins, commission)
    if (acct.coins.length > 0) {
      const coins = acct.coins.reduce((acc, c, i) => {
        if (i > 0) acc += ","
        acc += c.amount + c.denom
        return acc
      }, "")
      cp.execSync("mtm add-genesis-account " + acct.address + " " + coins, execOptions)
    }
  } else {
    //console.log("Discarding: " + atype[1] + ": " + JSON.stringify(acct.coins))
  }
})

const genesis = JSON.parse(fs.readFileSync(HOME + "/config/genesis.json"))

// Change stake -> utick
genesis.app_state.crisis.constant_fee.denom = "utick"
genesis.app_state.gov.deposit_params.min_deposit[0].denom = "utick"
genesis.app_state.mint.params.mint_denom = "utick"
genesis.app_state.staking.params.bond_denom = "utick"

// Governance
genesis.app_state.gov.starting_proposal_id = state.app_state.gov.starting_proposal_id
genesis.app_state.gov.voting_params.voting_period = "" + (state.app_state.gov.voting_params.voting_period / 1e9) + "s"

genesis.app_state.mint.minter = state.app_state.mint.minter

genesis.app_state.microtick.accounts = state.app_state.microtick.accounts.map(a => {
  return {
    account: a.account,
    placed_quotes: a.numQuotes,
    placed_trades: a.numTrades
  }
})
genesis.app_state.microtick.markets = state.app_state.microtick.markets
genesis.app_state.microtick.durations = state.app_state.microtick.durations

genesis.chain_id = "microtick-1"
genesis.genesis_time = "2021-08-02T15:00:00Z"

// Check total supply matches between export and generated genesis
const checkSupply = denom => {
  const was = state.app_state.bank.supply.reduce((acc, s) => {
    if (s.denom === denom) {
      return parseInt(s.amount, 10)
    }
    return acc
  }, 0)
  const is = genesis.app_state.bank.supply.reduce((acc, s) => {
    if (s.denom === denom) {
      return parseInt(s.amount, 10)
    }
    return acc
  }, 0)
  const diff = is - was
  //console.log(denom + " was: " + was + " after: " + is + " diff: " + diff + denom)
  
  if (diff < 0) {
    // adjust by increasing community pool and total supply
    combineCoins("adjust " + denom, genesis.app_state.distribution.fee_pool.community_pool, [{amount: "" + -diff, denom: denom}])
  }
}

checkSupply("udai")
checkSupply("utick")

genesis.app_state.bank.supply = state.app_state.bank.supply

genesis.app_state.auth.accounts = genesis.app_state.auth.accounts.sort((el1, el2) => {
  return el1.address.localeCompare(el2.address)
})

fs.writeFileSync("genesis.json", JSON.stringify(genesis, null, 2))
