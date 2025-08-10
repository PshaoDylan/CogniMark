document.addEventListener('DOMContentLoaded', function () {
  // Generate QR code for the current page URL by default
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url) {
      generateQRCode('qrcode-url', currentTab.url, 256, 'H');
    }
  });

  // Tab switching logic
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(button.dataset.tab).classList.add('active');
    });
  });

  // --- Placeholder for custom QR code generation ---
  const customText = document.getElementById('custom-text');
  const qrSize = document.getElementById('qr-size');
  const qrLevel = document.getElementById('qr-level');

  function generateCustomQRCode() {
    const text = customText.value;
    const size = parseInt(qrSize.value, 10);
    const level = qrLevel.value;
    if (text) {
      generateQRCode('qrcode-custom', text, size, level);
    }
  }

  customText.addEventListener('input', generateCustomQRCode);
  qrSize.addEventListener('change', generateCustomQRCode);
  qrLevel.addEventListener('change', generateCustomQRCode);


  // --- Copy and download buttons ---
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');

  function getActiveCanvas() {
    const activeTab = document.querySelector('.tab-content.active');
    return activeTab.querySelector('canvas');
  }

  copyBtn.addEventListener('click', () => {
    const canvas = getActiveCanvas();
    if (canvas) {
      canvas.toBlob(function(blob) {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item]).then(() => {
          // Optional: Show a success message
          copyBtn.textContent = '已复制!';
          setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
        }).catch(err => {
          console.error('无法复制图像: ', err);
        });
      }, 'image/png');
    }
  });

  downloadBtn.addEventListener('click', () => {
    const canvas = getActiveCanvas();
    if (canvas) {
      const link = document.createElement('a');
      link.download = 'qrcode.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  });


});

function generateQRCode(elementId, text, size, level) {
  const qrcodeContainer = document.getElementById(elementId);
  qrcodeContainer.innerHTML = ''; // Clear previous QR code
  new QRCode(qrcodeContainer, {
    text: text,
    width: size,
    height: size,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel[level]
  });
}
