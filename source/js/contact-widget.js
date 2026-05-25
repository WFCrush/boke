(function () {
  function html(text) {
    return String(text || '').replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  fetch('/boke/contact/contact.json', { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (contact) {
      if (!contact || (!contact.qq && !contact.wechat && !contact.wechatQr)) return;
      var button = document.createElement('button');
      button.className = 'boke-contact-button';
      button.type = 'button';
      button.textContent = '联系';

      var panel = document.createElement('div');
      panel.className = 'boke-contact-panel';
      panel.innerHTML = [
        '<h3>联系我</h3>',
        contact.qq ? '<a href="https://wpa.qq.com/msgrd?v=3&uin=' + encodeURIComponent(contact.qq) + '&site=qq&menu=yes" target="_blank" rel="noopener">QQ：' + html(contact.qq) + '</a>' : '',
        contact.wechat ? '<p>微信：' + html(contact.wechat) + '</p>' : '',
        contact.wechatQr ? '<img src="' + html(contact.wechatQr) + '" alt="微信二维码">' : '',
        contact.note ? '<p>' + html(contact.note) + '</p>' : ''
      ].join('');

      button.addEventListener('click', function () {
        panel.classList.toggle('is-open');
      });
      document.body.appendChild(panel);
      document.body.appendChild(button);
    })
    .catch(function () {});
})();
