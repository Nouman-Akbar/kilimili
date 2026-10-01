// Optimizes CMS images that bypass Liquid's image_url filter (rich text
// content such as product.description, page.content, article.content,
// collection.description and richtext blocks render plain <img> tags at
// original file size). Appends a width param so Shopify's CDN serves a
// resized version, converts heavyweight PNG sources to JPEG (the CDN still
// auto-serves WebP to capable browsers on top of that), and defers
// offscreen images.

(function () {
  var MIN_WIDTH = 200;
  var MAX_WIDTH = 2000;
  var FALLBACK_WIDTH = 1200;

  function isShopifyImage(src) {
    if (!src || src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return false;
    if (/\.(svg|gif)(\?|#|$)/i.test(src)) return false;
    try {
      var url = new URL(src, window.location.origin);
      return (
        url.hostname === 'cdn.shopify.com' ||
        url.hostname.endsWith('.shopifycdn.com') ||
        url.pathname.indexOf('/cdn/') === 0
      );
    } catch (e) {
      return false;
    }
  }

  function targetWidth(img) {
    var rendered = img.clientWidth || img.parentElement && img.parentElement.clientWidth || 0;
    var wanted = Math.ceil(rendered * (window.devicePixelRatio || 1));
    if (wanted <= 0) wanted = FALLBACK_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(wanted / 100) * 100));
  }

  function optimizeImage(img) {
    if (!img || img.tagName !== 'IMG' || img.dataset.imageOptimized) return;
    img.dataset.imageOptimized = 'true';

    var src = img.getAttribute('src');
    if (!src || !isShopifyImage(src)) return;

    var url = new URL(src, window.location.origin);
    var changed = false;
    if (!url.searchParams.has('width')) {
      url.searchParams.set('width', targetWidth(img));
      changed = true;
    }
    // Large photographic PNGs are served uncompressed to non-WebP clients;
    // format=jpg makes the CDN transcode them (WebP negotiation still applies).
    if (/\.png$/i.test(url.pathname) && !url.searchParams.has('format')) {
      url.searchParams.set('format', 'jpg');
      changed = true;
    }
    if (changed) {
      img.src = url.toString();
      img.removeAttribute('srcset');
    }

    if (img.closest('.rte')) {
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    }
  }

  function optimizeAll(root) {
    (root.querySelectorAll ? root.querySelectorAll('img') : []).forEach(optimizeImage);
    if (root.tagName === 'IMG') optimizeImage(root);
  }

  optimizeAll(document);

  if ('MutationObserver' in window) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) optimizeAll(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
