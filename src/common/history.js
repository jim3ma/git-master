function addFrame() {
  const history = $('<iframe class="history-frame" />');
  const historyClose = $('<a class="history-frame-close">Close</a>');
  const historyWrapper = $('<div class="history-wrapper"></div>');

  historyClose.click(() => {
    $('.history-frame')
      .attr('src', '');

    $('.history-wrapper')
      .hide();

    $('html,body')
      .removeClass('history-wrapper-scroll');
  });

  const body = $('body');

  if (body) {
    historyWrapper.append(history);
    historyWrapper.append(historyClose);

    body.append(historyWrapper);
  }
}

function openFrame(url) {
  $('.history-frame')
    .attr('src', url);

  $('.history-wrapper')
    .show();

  $('html,body')
    .addClass('history-wrapper-scroll');
}

export function isButtonInsertedBitbucket(url) {
  if (
    /https:\/\/bitbucket\.org\/[a-zA-Z0-9-_\.]*\/[a-zA-Z0-9-_\.]*\/src\/[a-zA-Z0-9-_\.]*\/.*/.test(
      url,
    )
  ) {
    const auxUrl = url.split('/');
    const lastUrlItemIndex = auxUrl[auxUrl.length];
    const isNotAFile = auxUrl[lastUrlItemIndex] === '';
    if (isNotAFile) {
      return false;
    }

    auxUrl[2] = 'bitbucket.githistory.xyz';
    url = auxUrl.join('/');
    const buttonWrapper = document.createElement('div');
    const buttonGitHistory = document.createElement('a');
    buttonGitHistory.innerHTML = 'Open in Git History';
    buttonGitHistory.setAttribute(
      'class',
      'Button__StyledLink-sc-1o41kgk-1 cTayNF',
    );
    // buttonGitHistory.setAttribute('href', url);
    buttonWrapper.appendChild(buttonGitHistory);
    try {
      document.getElementsByClassName('css-wrfxmk e1fwoj8y0')[0].appendChild(buttonWrapper);
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  } else {
    return false;
  }
}

export function isButtonInsertedGitlab(url) {
  if (
    /https:\/\/gitlab\.com\/([a-zA-Z0-9-_\.]*\/){1,}-*\/blob\/.*/.test(
      url,
    )
  ) {
    const urlObj = new URL(url);

    const targetUrl = `https://ineo6.gitee.io?file=${urlObj.pathname}&source=gitlab`;

    const buttonGitHistory = document.createElement('a');
    buttonGitHistory.innerHTML = 'Open in Git History';
    buttonGitHistory.setAttribute('class', 'btn btn-default btn-sm');

    addFrame();

    buttonGitHistory.onclick = function() {
      openFrame(targetUrl);
    };

    try {
      document
        .getElementsByClassName('file-actions')[0]
        .childNodes[3].appendChild(buttonGitHistory);
      return true;
    } catch (error) {
      return false;
    }
  } else {
    return false;
  }
}

export function isButtonInsertedGithub(url) {
  if (
    /https:\/\/github\.com\/[a-zA-Z0-9-_\.]*\/[a-zA-Z0-9-_\.]*\/blob\/.*/.test(
      url,
    )
  ) {
    const urlObj = new URL(url);

    const targetUrl = `https://ineo6.gitee.io?file=${urlObj.pathname}`;

    const buttonGithubHistory = document.createElement('a');
    buttonGithubHistory.innerHTML = 'Open in Git History';
    buttonGithubHistory.setAttribute('class', 'btn btn-sm BtnGroup-item');
    // buttonGithubHistory.setAttribute('href', url);

    addFrame();

    buttonGithubHistory.onclick = function() {
      openFrame(targetUrl);
    };

    try {
      document
        .getElementById('raw-url')
        .parentNode
        .appendChild(buttonGithubHistory);

      return true;
    } catch (error) {
      return false;
    }
  } else {
    return false;
  }
}
