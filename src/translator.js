const turndown = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const { searchFile } = require('./searchFile')
const SEARCH_DIRECTORY = '/home/tombo/workspace/tombomemo_wordpress/wp-content/uploads';

function initTurndownService() {
  const turndownService = new turndown({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  });

  turndownService.use(turndownPluginGfm.tables);

  // remove anchor link from image
  turndownService.addRule('removeAnchor', {
    filter: node => {
      return (
        node.getAttribute('class') && (
          node.getAttribute('class').includes('wp-block-image') ||
          node.getAttribute('class').includes('blocks-gallery-item')
        )
      )
    },
    replacement: (content, node, options) => {

      // extract raw image src
      let imageSrcList = [];
      //get img src
      let images = node.querySelectorAll('img')
      for (let i = 0; i < images.length; i++) {
        images[i].getAttribute('src').match(/.(jpg|png|jpeg|gif)$/g) && imageSrcList.push(images[i].getAttribute('src'))
      }
      // get anchor link image src
      let links = node.querySelectorAll('a')
      for (let i = 0; i < links.length; i++) {
        links[i].getAttribute('href').match(/.(jpg|png|jpeg|gif)$/g) && imageSrcList.push(links[i].getAttribute('href'))
      }

      if (imageSrcList.length === 0) {
        // 画像の拡張子がなく、imgSrcListに追加されない場合
        // Ex)
        // [![](https://t.felmat.net/fmimg/Z3234E.665739T.P679219)](https://t.felmat.net/fmcl?ak=Z3234E.1.665739T.P679219)
        return content;
      }

      // filter raw images
      const rawImagesSrcList = imageSrcList.filter((value) => {
        return !(value.match(/.*?(-\d+x\d+).*(jpg|png|jpeg|gif)$/g))
      })

      // get raw image path from local files
      // anchor linkやimgにraw画像のパスを見つけられなかった場合、
      // ftpでWordPressと同期しているローカルファイルを探索して、
      // raw画像を探し出す
      // let rawFileUrl = '';
      if (rawImagesSrcList.length === 0) {
        const rawFileName = imageSrcList[0].match(/.*\/(.*)?(-\d+x\d+).*(jpg|png|jpeg|gif)$/)[1]
        const searchRawRegex = new RegExp(`${rawFileName}.(jpg|png|jpeg|gif)$`)
        const rawFileList = searchFile(SEARCH_DIRECTORY, searchRawRegex)
        rawFileList[0] && rawImagesSrcList.push(rawFileList[0].replace('/home/tombo/workspace/tombomemo_wordpress', 'https://tombomemo.com'))
      }

      // set image src for markdown
      const imageSrc = rawImagesSrcList[0] || imageSrcList[0] || ''

      // extract alt string
      let altStringList = []
      //get img src
      for (let i = 0; i < images.length; i++) {
        images[i].getAttribute('alt') && altStringList.push(images[i].getAttribute('alt'))
      }
      //get figcaption
      let figcaptions = node.querySelectorAll('figcaption')
      for (let i = 0; i < figcaptions.length; i++) {
        figcaptions[i].textContent && altStringList.push(figcaptions[i].textContent.trim())
      }
      const imageAlt = altStringList[0] || '';

      return `![${imageAlt}](${imageSrc})`
    }
  });

  // preserve embedded tweets
  turndownService.addRule('tweet', {
    filter: node => node.nodeName === 'BLOCKQUOTE' && node.getAttribute('class') === 'twitter-tweet',
    replacement: (content, node) => '\n\n' + node.outerHTML
  });

  // preserve embedded codepens
  turndownService.addRule('codepen', {
    filter: node => {
      // codepen embed snippets have changed over the years
      // but this series of checks should find the commonalities
      return (
        ['P', 'DIV'].includes(node.nodeName) &&
        node.attributes['data-slug-hash'] &&
        node.getAttribute('class') === 'codepen'
      );
    },
    replacement: (content, node) => '\n\n' + node.outerHTML
  });

  // preserve embedded scripts (for tweets, codepens, gists, etc.)
  turndownService.addRule('script', {
    filter: 'script',
    replacement: (content, node) => {
      let before = '\n\n';
      if (node.previousSibling && node.previousSibling.nodeName !== '#text') {
        // keep twitter and codepen <script> tags snug with the element above them
        before = '\n';
      }
      const html = node.outerHTML.replace('async=""', 'async');
      return before + html + '\n\n';
    }
  });

  // preserve iframes (common for embedded audio/video)
  turndownService.addRule('iframe', {
    filter: 'iframe',
    replacement: (content, node) => {
      const html = node.outerHTML.replace('allowfullscreen=""', 'allowfullscreen');
      return '\n\n' + html + '\n\n';
    }
  });

  return turndownService;
}

function getPostContent(post, turndownService, config) {
  let content = post.encoded[0];

  // insert an empty div element between double line breaks
  // this nifty trick causes turndown to keep adjacent paragraphs separated
  // without mucking up content inside of other elemnts (like <code> blocks)
  content = content.replace(/(\r?\n){2}/g, '\n<div></div>\n');

  if (config.saveScrapedImages) {
    // writeImageFile() will save all content images to a relative /images
    //convert raw image path
    content = content.replace(/(<img[^>]*src=").*?([^/"]+)(-\d+x\d+)\.(gif|jpe?g|png)("[^>]*>)/gi, '$1/assets/$2.$4$5');
    // folder so update references in post content to match
    content = content.replace(/(<img[^>]*src=").*?([^/"]+\.(?:gif|jpe?g|png))("[^>]*>)/gi, '$1/assets/$2$3');
  }

  // this is a hack to make <iframe> nodes non-empty by inserting a "." which
  // allows the iframe rule declared in initTurndownService() to take effect
  // (using turndown's blankRule() and keep() solution did not work for me)
  content = content.replace(/(<\/iframe>)/gi, '.$1');

  // use turndown to convert HTML to Markdown
  content = turndownService.turndown(content);

  // clean up extra spaces in list items
  content = content.replace(/(-|\d+\.) +/g, '$1 ');

  // clean up the "." from the iframe hack above
  content = content.replace(/\.(<\/iframe>)/gi, '$1');

  return content;
}

exports.initTurndownService = initTurndownService;
exports.getPostContent = getPostContent;
