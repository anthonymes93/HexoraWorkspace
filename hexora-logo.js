'use strict';
// User-supplied Hexora logo, embedded so installed releases never depend on a source-tree path.
const fs=require('node:fs');
const path=require('node:path');
const PNG_BASE64='iVBORw0KGgoAAAANSUhEUgAAADkAAABACAMAAACX6y++AAAAkFBMVEUAAAAOWOsSH54aL9sLGGoRme9dJ+lZXqCiTPH1+v0eTa9ho9WMOvmfn92c1vGaid9Ootdhb6OOddIFw/dNKbBZYctyrdBJVXhTW68xM2dJSHLMreorTp+cZtA4Omg8RHo7asYykNZoyeCdetYzN5Jvds1wkLVJqdR6yO88VHU4SJ1gPKN9Ss9Yhb2Fz+U+Plsqj9OfAAAAMHRSTlMA/f3++vv8YvsH62b/JCFEli9N/++aMDOOqF8fq5hRZ6yvYzedUyvTNDJssNFvSDUw7HYtAAADFUlEQVR42pXX61ajMBAA4CSEQIK0gKDUtlur62XVdd//7TaThFwgsWXO8Rx/+DlDLsOAUCp4NeDHiqPVsWkwxOPdSscrbEIM9Sp3xjYy/HJ1yXWTy3CUHK7Lt1HOwgyCjPUVheZ5mFFTUvxc8uapicJLln8bF5OS/m5TC1O95XPpQxlFHS0UNd8HIQTGiZQStmM3L5k/yUQNQq8HSoiIPSUhqEY1Y8MzD3YCQYkV/FpQaclMEvOQUrKv4947onl+e6ultCdn54sDsizLbu8KzaecEK+KZl7KaWVA3tyU5REe971R+XyJCqpW0kG7/MzQUpYMcC7/UE0NdnKrZAlxRG8ReW8lScoS5QlJqeMzqSkS9tzMclIdS2koEvhnCelTEuOodJSeohL2TVuclA8Jmcl+oY55sCvUi1/xajM4KiqzlS0NIyYRPKc+KVj8tVLetbEYx8JEG9kVZHKq62CX8E5e8WYTucRWMkJBTtRJtWARa84Q6wlInJCyMVSbmGQMToeWOCGl5UupT+QlicO3ynZyP8rYG6nuyUyqLaWBdI2o39qSt2Qh5THyJQoabl/MmoWKSRJfbirh9T7mHqMgC6kOeOH17cFRxuI5JxhK+U57nJwv5znB+dVq+4INXErYCWQykoWUezCipMxAkoXknKsf9DJEpdp+JFzl9g/ud7YHkaXUTx+X/9ylJmBt/Z3p3fK/9fGcQUcg7iR0FoI019pv5a3fNKm3XR2ZIEh7zDwpgtbnep+S+o4y5F7Qgcx8e/IlW0rhSXV5yDKngz0a3YTn9T5z8cisa3YWsnGaRnHQb4W97SQhh70/kE6SD/7YJu1uutqdcV9dba6jaXXTyIjD8ULSsPcdXYN5P9s3kqs+8yh9UGmfVaHhRFSd1VtQpsc4Snew8s99/7mcwipU8SqYFrE3gIGVNX4W+8hL43UTn231sKj2dZ+aNrdNWrqHjU/GVWRGta6+8JmynG71nrYXB/n3c7hEKuOu4Ku+clTrh4Qf136xeKcB4Kld8ZVUD1Ye1ripx8PnUbH+a5BXgoiP9E78B0RqMvYvk6iFAAAAAElFTkSuQmCC';
function logoIconPath(userData){
 const target=path.join(userData,'taskbar-icons','hexora-official-v2.ico');
 if(!fs.existsSync(target)){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const png=Buffer.from(PNG_BASE64,'base64');
  const header=Buffer.alloc(22);
  header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
  header[6]=png.readUInt32BE(16)===256?0:png.readUInt32BE(16);
  header[7]=png.readUInt32BE(20)===256?0:png.readUInt32BE(20);
  header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);
  header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  fs.writeFileSync(target,Buffer.concat([header,png]));
 }
 return target;
}
module.exports={logoIconPath};
