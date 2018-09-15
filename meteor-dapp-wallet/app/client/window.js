$(window).on('blur', function(e) {
  $('body').addClass('app-blur');
});
$(window).on('focus', function(e) {
  $('body').removeClass('app-blur');
});
