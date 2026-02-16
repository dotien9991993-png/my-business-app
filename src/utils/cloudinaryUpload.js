const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dhvn5cueh';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'hoangnam_unsigned';

// Nén ảnh trước khi upload
const compressImage = (file, maxWidth = 1920, quality = 0.7) => {
  return new Promise((resolve) => {
    if (file.size < 500 * 1024) { resolve(file); return; }
    const reader = new FileReader();
    reader.onerror = () => { console.warn('FileReader error, using original file'); resolve(file); };
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => { console.warn('Image decode error, using original file'); resolve(file); };
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              if (!blob) { console.warn('canvas.toBlob returned null, using original file'); resolve(file); return; }
              resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            },
            'image/jpeg', quality
          );
        } catch (err) {
          console.warn('Compress error, using original file:', err);
          resolve(file);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// Upload 1 ảnh lên Cloudinary
export const uploadImage = async (file, folder = 'chat') => {
  console.log('[Cloudinary] Uploading:', file.name, 'size:', file.size, 'type:', file.type);
  console.log('[Cloudinary] Config - cloud:', CLOUD_NAME, 'preset:', UPLOAD_PRESET);

  const compressed = await compressImage(file);
  console.log('[Cloudinary] After compress:', compressed.name, 'size:', compressed.size);

  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `hoangnam/${folder}`);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  console.log('[Cloudinary] POST:', url);

  const response = await fetch(url, { method: 'POST', body: formData });
  const data = await response.json();
  console.log('[Cloudinary] Response status:', response.status, 'data:', data);

  if (data.error) {
    const errMsg = data.error.message || JSON.stringify(data.error);
    console.error('[Cloudinary] API error:', errMsg);
    throw new Error(errMsg);
  }

  if (!response.ok) {
    throw new Error(`Upload thất bại (HTTP ${response.status})`);
  }

  return {
    url: data.secure_url,
    public_id: data.public_id,
    width: data.width,
    height: data.height,
    file_size: data.bytes,
    original_size: file.size,
    format: data.format
  };
};

// Upload nhiều ảnh
export const uploadImages = async (files, folder = 'chat', onProgress) => {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const result = await uploadImage(files[i], folder);
    results.push(result);
    if (onProgress) onProgress(i + 1, files.length);
  }
  return results;
};

// Kiểm tra URL có phải Cloudinary không
export const isCloudinaryUrl = (url) => {
  return url && url.includes('res.cloudinary.com');
};

// Tạo URL thumbnail từ Cloudinary
export const getThumbnailUrl = (url, width = 200, height = 200) => {
  if (!isCloudinaryUrl(url)) return url;
  return url.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto/`);
};

// Tạo URL ảnh chat (vừa phải)
export const getChatImageUrl = (url, maxWidth = 400) => {
  if (!isCloudinaryUrl(url)) return url;
  return url.replace('/upload/', `/upload/w_${maxWidth},q_auto/`);
};

// Tạo URL ảnh full (xem chi tiết)
export const getFullImageUrl = (url) => {
  if (!isCloudinaryUrl(url)) return url;
  return url.replace('/upload/', '/upload/q_auto/');
};
