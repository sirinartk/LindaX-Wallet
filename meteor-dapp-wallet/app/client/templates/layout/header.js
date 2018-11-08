/**
Template Controllers

@module Templates
*/

/**
The header template

@class [template] layout_header
@constructor
*/

Template['layout_header'].onCreated(function() {
  var template = this;
});

Template['layout_header'].helpers({
  /**
    Returns the correct url for the send to route

    @method (goToSend)
    @return {String}
    */
  goToSend: function() {
    FlowRouter.watchPathChange();
    var address = web3.utils.toChecksumAddress(FlowRouter.getParam('address'));
    var accounts = LXAccounts.find({}).fetch();

    // For some reason the path /send/ doesn't show tokens anymore
    return address
      ? FlowRouter.path('sendFrom', { from: address })
      : FlowRouter.path('sendFrom', {
          from: accounts[0] ? accounts[0].address : null
        });
  },
  /**
    Calculates the total balance of all accounts + wallets.

    @method (totalBalance)
    @return {String}
    */
  totalBalance: function() {
    var accounts = LXAccounts.find({}).fetch();
    var wallets = Wallets.find({
      owners: { $in: _.pluck(accounts, 'address') }
    }).fetch();

    var balance = _.reduce(
      _.pluck(_.union(accounts, wallets), 'balance'),
      function(memo, num) {
        return new BigNumber(memo).plus(BigNumber(num));
      },
      0
    );

    updateMistBadge();

    return balance;
  },
  /**
    Formats the last block number

    @method (formattedBlockNumber)
    @return {String}
    */
  formattedBlockNumber: function() {
    return LXBlocks.latest.number > 0
      ? numeral(LXBlocks.latest.number).format('0,0')
      : '--';
  },
  /**
    Gets the time since the last block

    @method (timeSinceBlock)
    */
  timeSinceBlock: function() {
    if (
      LXBlocks.latest.timestamp == 0 ||
      typeof LXBlocks.latest.timestamp == 'undefined'
    )
      return false;

    var timeSince = moment(LXBlocks.latest.timestamp, 'X');
    var now = moment();
    var diff = now.diff(timeSince, 'seconds');

    if (diff > 60 * 5) {
      Helpers.rerun['10s'].tick();
      return '<span class="red">' + timeSince.fromNow(true) + '</span>';
    } else if (diff > 60) {
      Helpers.rerun['10s'].tick();
      return timeSince.fromNow(true);
    } else if (diff < 2) {
      Helpers.rerun['1s'].tick();
      return '';
    } else {
      Helpers.rerun['1s'].tick();
      return diff + 's ';
    }
  },
  /**
    Formats the time since the last block

    @method (timeSinceBlockText)
    */
  timeSinceBlockText: function() {
    if (
      LXBlocks.latest.timestamp == 0 ||
      typeof LXBlocks.latest.timestamp == 'undefined'
    )
      return TAPi18n.__('wallet.app.texts.waitingForBlocks');

    var timeSince = moment(LXBlocks.latest.timestamp, 'X');
    var now = moment();
    var diff = now.diff(timeSince, 'seconds');

    if (diff > 60 * 5) {
      Helpers.rerun['10s'].tick();
      return (
        '<span class="red">' +
        TAPi18n.__('wallet.app.texts.timeSinceBlock') +
        '</span>'
      );
    } else if (diff > 60) {
      Helpers.rerun['10s'].tick();
      return TAPi18n.__('wallet.app.texts.timeSinceBlock');
    } else if (diff < 2) {
      Helpers.rerun['1s'].tick();
      return (
        '<span>' + TAPi18n.__('wallet.app.texts.blockReceived') + '</span>'
      );
    } else {
      Helpers.rerun['1s'].tick();
      return TAPi18n.__('wallet.app.texts.timeSinceBlock');
    }
  }
});
