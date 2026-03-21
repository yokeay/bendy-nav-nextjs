//当前文件只有扩展下面才有的
window.ExtDomain = 'extDomain'
window.ExtUrl = "extUrl"

chrome.cookies.get({ url: window.ExtUrl, name: 'user_id' }, function (cookie) {
    if (cookie) {
        localStorage.setItem('user_id', cookie.value);
    }
})
chrome.cookies.get({ url: window.ExtUrl, name: 'token' }, function (cookie) {
    if (cookie) {
        localStorage.setItem('token', cookie.value);
    }
})
if (localStorage.getItem('user_id') && localStorage.getItem('token')) {
    //如果存在LocalStroe就写入cookie
    const userID = {
        url: ExtUrl, // 目标域名
        name: "user_id",
        value: localStorage.getItem('user_id'),
        path: "/", // 可选：指定cookie的路径
        expirationDate: Math.floor((new Date().getTime() / 1000) + (7 * 24 * 3600))
    };
    const Token = {
        url: ExtUrl, // 目标域名
        name: "token",
        value: localStorage.getItem('token'),
        path: "/", // 可选：指定cookie的路径
        expirationDate: Math.floor((new Date().getTime() / 1000) + (7 * 24 * 3600))
    };
    chrome.cookies.set(userID, function (cookie) {});
    chrome.cookies.set(Token, function (cookie) {});
}