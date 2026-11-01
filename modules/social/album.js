// ========== 相册功能（从 script.js 补充拆分，原第 20711~20865 行） ==========

  async function renderAlbumList() {
    const albumGrid = document.getElementById('album-grid-page');
    if (!albumGrid) return;
    const albums = await db.qzoneAlbums.orderBy('createdAt').reverse().toArray();
    albumGrid.innerHTML = '';
    if (albums.length === 0) {
      albumGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">你还没有创建任何相册哦~</p>';
      return;
    }
    albums.forEach(album => {
      const albumItem = document.createElement('div');
      albumItem.className = 'album-item';
      albumItem.innerHTML = `
                            <div class="album-cover" style="background-image: url(${album.coverUrl});"></div>
                            <div class="album-info">
                                <p class="album-name">${album.name}</p>
                                <p class="album-count">${album.photoCount || 0} 张</p>
                            </div>
                        `;
      albumItem.addEventListener('click', () => {
        openAlbum(album.id);
      });

      addLongPressListener(albumItem, async () => {
        const confirmed = await showCustomConfirm(
          '删除相册',
          `确定要删除相册《${album.name}》吗？此操作将同时删除相册内的所有照片，且无法恢复。`, {
          confirmButtonClass: 'btn-danger'
        }
        );

        if (confirmed) {
          await db.qzonePhotos.where('albumId').equals(album.id).delete();
          await db.qzoneAlbums.delete(album.id);
          await renderAlbumList();
          alert('相册已成功删除。');
        }
      });

      albumGrid.appendChild(albumItem);
    });
  }

  async function openAlbum(albumId) {
    state.activeAlbumId = albumId;
    await renderAlbumPhotosScreen();
    showScreen('album-photos-screen');
  }

  async function renderAlbumPhotosScreen() {
    if (!state.activeAlbumId) return;
    const photosGrid = document.getElementById('photos-grid-page');
    const headerTitle = document.getElementById('album-photos-title');
    const album = await db.qzoneAlbums.get(state.activeAlbumId);
    if (!album) {
      console.error("找不到相册:", state.activeAlbumId);
      showScreen('album-screen');
      return;
    }
    headerTitle.textContent = album.name;
    const photos = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).toArray();
    photosGrid.innerHTML = '';
    if (photos.length === 0) {
      photosGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">这个相册还是空的，快上传第一张照片吧！</p>';
    } else {
      photos.forEach(photo => {
        const photoItem = document.createElement('div');
        photoItem.className = 'photo-item';
        photoItem.innerHTML = `
                                <img src="${photo.url}" class="photo-thumb" alt="相册照片">
                                <button class="photo-delete-btn" data-photo-id="${photo.id}">×</button>
                            `;
        photosGrid.appendChild(photoItem);
      });
    }
  }

  async function openPhotoViewer(clickedPhotoUrl) {
    if (!state.activeAlbumId) return;
    const photosInAlbum = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).toArray();
    photoViewerState.photos = photosInAlbum.map(p => p.url);
    photoViewerState.currentIndex = photoViewerState.photos.findIndex(url => url === clickedPhotoUrl);
    if (photoViewerState.currentIndex === -1) return;
    document.getElementById('photo-viewer-modal').classList.add('visible');
    renderPhotoViewer();
    photoViewerState.isOpen = true;
  }

  function renderPhotoViewer() {
    if (photoViewerState.currentIndex === -1) return;
    const imageEl = document.getElementById('photo-viewer-image');
    window.prepareLockedImagePreview?.(document.querySelector('#photo-viewer-modal .photo-viewer-content'), imageEl);
    const prevBtn = document.getElementById('photo-viewer-prev-btn');
    const nextBtn = document.getElementById('photo-viewer-next-btn');
    imageEl.style.opacity = 0;
    setTimeout(() => {
      imageEl.src = photoViewerState.photos[photoViewerState.currentIndex];
      imageEl.style.opacity = 1;
    }, 100);
    prevBtn.disabled = photoViewerState.currentIndex === 0;
    nextBtn.disabled = photoViewerState.currentIndex === photoViewerState.photos.length - 1;
  }

  function showNextPhoto() {
    if (photoViewerState.currentIndex < photoViewerState.photos.length - 1) {
      photoViewerState.currentIndex++;
      renderPhotoViewer();
    }
  }

  function showPrevPhoto() {
    if (photoViewerState.currentIndex > 0) {
      photoViewerState.currentIndex--;
      renderPhotoViewer();
    }
  }

  function closePhotoViewer() {
    document.getElementById('photo-viewer-modal').classList.remove('visible');
    photoViewerState.isOpen = false;
    photoViewerState.photos = [];
    photoViewerState.currentIndex = -1;
    document.getElementById('photo-viewer-image').src = '';
  }

