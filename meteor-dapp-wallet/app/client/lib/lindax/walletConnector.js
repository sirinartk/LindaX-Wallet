/**
The walletConnector

@class walletConnector
@constructor
*/

/**
Contains all wallet contracts

@property contracts
*/
contracts = {};

/**
Contains all collection observers

@property collectionObservers
*/
collectionObservers = [];

/**
Config for the LindaX connector

@property config
*/
lindaxConfig = {
  /**
    Number of blocks to rollback, from the last checkpoint block of the wallet.

    @property lindaxConfig.rollBackBy
    */
  rollBackBy: 0,
  /**
    Number of blocks to confirm a wallet

    @property lindaxConfig.requiredConfirmations
    */
  requiredConfirmations: 12,
  /**
    The default daily limit used for simple accounts

    @property lindaxConfig.dailyLimitDefault
    */
  dailyLimitDefault: '100000000000000000000000000'
};

/**
Check and set which network we are on.

@method checkNetwork
*/
Session.setDefault('network', false);
var checkNetwork = function() {
  web3.eth.getBlock(0).then(function(block) {
    switch (block.hash) {
      case '0xaa9da902a93b360bec5f2401d2bdfae952a03b331f7dc7e7560ec5a20ed1148e':
        Session.set('network', 'main');
        break;
      case '0x0b6193d6734e1cd18381f477102f7be9e354d051f44aeab1acde8e56f6863490':
        Session.set('network', 'trajectory');
        break;
      default:
        Session.set('network', 'private');
    }
  });
};

/**
Connects to a node and setup all the subscriptions for the accounts.

@method connectToNode
*/
connectToNode = function() {
  console.time('startNode');
  console.log('Connect to node...');

  checkNetwork();

  LXAccounts.init();
  LXBlocks.init();

  LXTools.ticker.start({
    extraParams: typeof mist !== 'undefined' ? 'Mist-' + mist.version : '',
    currencies: ['BTC', 'USD', 'EUR', 'BRL', 'GBP']
  });

  if (LXAccounts.find().count() > 0) {
    checkForOriginalWallet();
  }

  // Reset collection observers
  _.each(collectionObservers, function(observer) {
    if (observer) {
      observer.stop();
    }
  });
  collectionObservers = [];

  observeLatestBlocks();

  observeWallets();

  observeTransactions();

  observeEvents();

  observeTokens();

  observePendingConfirmations();

  observeCustomContracts();

  console.timeEnd('startNode');
};

/**
Will remove all transactions, and will set the checkpointBlock to the creationBlock in the wallets

@method connectToNode
*/
resetWallet = function function_name(argument) {
  _.each(Transactions.find().fetch(), function(tx) {
    console.log(tx._id);
    try {
      Transactions.remove(tx._id);
    } catch (e) {
      console.error(e);
    }
  });

  _.each(PendingConfirmations.find().fetch(), function(pc) {
    try {
      PendingConfirmations.remove(pc._id);
    } catch (e) {
      console.error(e);
    }
  });

  _.each(Wallets.find().fetch(), function(wallet) {
    Wallets.update(wallet._id, {
      $set: {
        checkpointBlock: wallet.creationBlock,
        transactions: []
      }
    });
  });

  web3.eth.clearSubscriptions();

  console.log('The wallet will re-fetch log information in 6 seconds...');

  setTimeout(function() {
    console.log('Fetching logs...');
    connectToNode();
  }, 1000 * 6);
};
