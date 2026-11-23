import {AppError} from './security.mjs';
import {readImage} from './facebook-media.mjs';
import {storeImage,storeFile,isHosted} from './media-storage.mjs';

// Instagram downloads the image at publish time and accepts only JPEG with a width:height
// ratio between 4:5 and 1.91:1. Images outside it are placed on a blurred copy of
// themselves instead of being cropped, so no part of the picture is lost.
const minRatio=0.8,maxRatio=1.91,maxSide=2160,maxBytes=8*1024*1024,limitInputPixels=40e6;
export async function instagramJpeg(bytes){
 const sharp=(await import('sharp')).default,open=()=>sharp(bytes,{limitInputPixels}).rotate().flatten({background:'#ffffff'});
 let meta;try{meta=await sharp(bytes,{limitInputPixels}).metadata();}catch{throw new AppError('Plik nie jest obsługiwanym obrazem. Prześlij JPEG, PNG albo WebP.',400,'provider_rejected');}
 const turned=meta.orientation>=5,w=turned?meta.height:meta.width,h=turned?meta.width:meta.height;
 if(!w||!h)throw new AppError('Nie udało się odczytać wymiarów obrazu.',400,'provider_rejected');
 const ratio=w/h,fits=ratio>=minRatio&&ratio<=maxRatio;
 if(meta.format==='jpeg'&&fits&&!(meta.orientation>1)&&Math.max(w,h)<=maxSide&&bytes.length<=maxBytes)return{bytes,width:w,height:h,adjusted:false};
 const scale=Math.min(1,maxSide/Math.max(w,h)),W=Math.round(w*scale),H=Math.round(h*scale);
 if(fits)return{bytes:await open().resize(W,H).jpeg({quality:90}).toBuffer(),width:W,height:H,adjusted:false};
 const CW=ratio<minRatio?Math.ceil(H*minRatio):W,CH=ratio<minRatio?H:Math.ceil(W/maxRatio);
 const picture=await open().resize(W,H).jpeg({quality:95}).toBuffer();
 const out=await open().resize(CW,CH,{fit:'cover'}).blur(40).composite([{input:picture,gravity:'centre'}]).jpeg({quality:90}).toBuffer();
 return{bytes:out,width:CW,height:CH,adjusted:true};
}
export async function hostInstagramImage(source){const image=await instagramJpeg(await readImage(source));return{image_url:await storeImage(image.bytes,'image/jpeg','jpg'),width:image.width,height:image.height,adjusted:image.adjusted};}
// Reels are MP4 or MOV (ISO media files). Instagram checks codecs and duration itself.
export function videoType(bytes){if(bytes.length>12&&bytes.subarray(4,8).toString('latin1')==='ftyp')return bytes.subarray(8,12).toString('latin1')==='qt  '?['video/quicktime','mov']:['video/mp4','mp4'];throw new AppError('Rolka musi być plikiem wideo MP4 albo MOV.',400,'provider_rejected');}
export async function hostInstagramVideo(source){const bytes=await readImage(source,{maxBytes:100*1024*1024}),[mime,ext]=videoType(bytes);return{video_url:await storeFile(bytes,mime,ext,'video'),size_mb:Math.round(bytes.length/1048576*10)/10};}
// Links in a draft are copied right away; a link from the conversation would expire before publishing.
export async function hostInstagramPayload(payload={}){
 const image_urls=[];for(const url of payload.image_urls||[])image_urls.push(isHosted(url)?url:(await hostInstagramImage({url})).image_url);
 const video_url=payload.video_url&&!isHosted(payload.video_url)?(await hostInstagramVideo({url:payload.video_url})).video_url:payload.video_url;
 return{...payload,...(payload.image_urls?{image_urls}:{}),...(video_url?{video_url}:{})};
}
