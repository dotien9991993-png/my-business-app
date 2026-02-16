const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dhvn5cueh';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'hoangnam_unsigned';

// Nén ảnh trước khi upload
const compressImage = (file, maxWidth = 1920, quality = 0.7) => {
  return new Promise((resolve) => {
    if (file.size < 500 * 1024) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })),
          'image/jpeg', quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// Upload 1 ảnh lên Cloudinary
export const uploadImage = async (file, folder = 'chat') => {
  const compressed = await compressImage(file);

  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `hoangnam/${folder}`);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    throw new Error('Upload ảnh thất bại');
  }

  const data = await response.json();

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
