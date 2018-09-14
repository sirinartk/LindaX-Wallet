updateMistBadge = function() {
  var conf = PendingConfirmations.findOne({ operation: { $exists: true } });
  // set total balance in Mist menu, of no pending confirmation is Present
  if (typeof mist !== 'undefined' && (!conf || !conf.confirmedOwners.length)) {
    var accounts = LXAccounts.find({}).fetch();
    var wallets = Wallets.find({
      owners: { $in: _.pluck(accounts, 'address') }
    }).fetch();

    var balance = _.reduce(
      _.pluck(_.union(accounts, wallets), 'balance'),
      function(memo, num) {
        return memo + Number(num);
      },
      0
    );

    mist.menu.setBadge(
      LXTools.formatBalance(balance, '0.0 a', 'LindaX') + ' ETH'
    );
  }
};

// ADD MIST MENU
updateMistMenu = function() {
  if (typeof mist === 'undefined') return;

  var accounts = _.union(
    Wallets.find({}, { sort: { name: 1 } }).fetch(),
    LXAccounts.find({}, { sort: { name: 1 } }).fetch()
  );

  // sort by balance
  accounts.sort(Helpers.sortByBalance);

  Meteor.setTimeout(function() {
    var routeName = FlowRouter.current().route.name;

    // add/update mist menu
    mist.menu.clear();
    mist.menu.add(
      'wallets',
      {
        position: 1,
        name: TAPi18n.__('wallet.app.buttons.wallet'),
        selected: routeName === 'dashboard'
      },
      function() {
        FlowRouter.go('/');
      }
    );
    mist.menu.add(
      'send',
      {
        position: 2,
        name: TAPi18n.__('wallet.app.buttons.send'),
        selected: routeName === 'send' || routeName === 'sendTo'
      },
      function() {
        FlowRouter.go('/send');
      }
    );

    _.each(accounts, function(account, index) {
      mist.menu.add(
        account._id,
        {
          position: 3 + index,
          name: account.name,
          badge:
            LXTools.formatBalance(account.balance, '0 a', 'LindaX') + ' ETH',
          selected: location.pathname === '/account/' + account.address
        },
        function() {
          FlowRouter.go('/account/' + account.address);
        }
      );
    });

    // set total balance in header.js
  }, 10);
};

Meteor.startup(function() {
  // make reactive
  Tracker.autorun(updateMistMenu);
});
