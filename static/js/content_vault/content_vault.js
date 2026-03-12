/**
 * content_vault.js
 * Handles the Read-Only Drive Interface.
 */

// State
let currentView = 'folders'; // 'folders' or 'files'
let currentFolderId = null;
let currentFolderName = '';

// Pagination
let currentPage = 0;
let pageSize = 20;
let totalFiles = 0;

$(document).ready(function() {
    loadFolders(); // Init: Load Root

    // Filters
    $("#filterMediaType, #filterDate").on("change", function() {
        currentPage = 0;
        loadFiles(currentFolderId);
    });

    // Pagination
    $("#btnPrevPage").on("click", function() { if (currentPage > 0) { currentPage -= pageSize; loadFiles(currentFolderId); }});
    $("#btnNextPage").on("click", function() { if ((currentPage + pageSize) < totalFiles) { currentPage += pageSize; loadFiles(currentFolderId); }});
});

// ==========================================
// 1. FOLDERS VIEW (Root)
// ==========================================

function loadFolders() {
    currentView = 'folders';
    currentFolderId = null;
    
    // UI Reset
    updateBreadcrumbs();
    $("#fileFilters, #vaultPagination").addClass("d-none");
    $("#contentGrid").html(renderSkeletons(4)); // Loading state

    axios.get('/api/content_vault/folders')
        .then(res => {
            renderFolders(res.data.folders);
        })
        .catch(err => {
            console.error(err);
            $("#contentGrid").html('<div class="col-12 text-center text-danger py-5">Failed to load folders.</div>');
        });
}

function renderFolders(folders) {
    const container = $("#contentGrid");
    container.empty();

    if (folders.length === 0) {
        container.html('<div class="col-12 text-center text-muted py-5"><i class="ri-folder-unknow-line fs-1"></i><p class="mt-2">No folders available.</p></div>');
        return;
    }

    folders.forEach(folder => {
        const avatar = folder.profile_picture_url || `https://ui-avatars.com/api/?name=${folder.full_name || 'User'}&background=random`;
        
        // --- FIX: Format Role (team_member -> Team Member) ---
        const roleRaw = folder.role || 'User';
        const roleFormatted = roleRaw
            .replace(/_/g, ' ')          // Replace underscores with spaces
            .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word

        container.append(`
            <div class="col-6 col-md-4 col-lg-3 col-xl-2">
                <div class="folder-card" onclick="enterFolder(${folder.id}, '${folder.full_name || folder.username}')">
                    <div class="folder-icon-wrapper">
                        <img src="${avatar}" class="user-avatar-folder">
                        <div class="folder-badge">${folder.file_count}</div>
                    </div>
                    <h6 class="fw-bold text-dark text-truncate w-100 mb-1" title="${folder.full_name}">${folder.full_name || folder.username}</h6>
                    <span class="badge bg-light text-muted border border-light rounded-pill px-3">${roleFormatted}</span>
                </div>
            </div>
        `);
    });
}

// ==========================================
// 2. FILES VIEW (Inside Folder)
// ==========================================

function enterFolder(userId, userName) {
    currentView = 'files';
    currentFolderId = userId;
    currentFolderName = userName;
    currentPage = 0; // Reset pagination

    updateBreadcrumbs();
    $("#fileFilters").removeClass("d-none"); // Show filters
    loadFiles(userId);
}

function loadFiles(userId) {
    const container = $("#contentGrid");
    container.html(renderSkeletons(8));
    
    const params = {
        skip: currentPage,
        limit: pageSize,
        media_type: $("#filterMediaType").val() || null,
        date_from: $("#filterDate").val() || null // Backend handles logic
    };

    axios.get(`/api/content_vault/files/${userId}`, { params })
        .then(res => {
            totalFiles = res.data.total;
            renderFiles(res.data.data);
            updatePaginationUI();
        })
        .catch(err => {
            container.html('<div class="col-12 text-center text-danger py-5">Failed to load files.</div>');
        });
}

function renderFiles(files) {
    const container = $("#contentGrid");
    container.empty();

    if (files.length === 0) {
        container.html('<div class="col-12 text-center text-muted py-5"><i class="ri-ghost-line fs-1 opacity-50"></i><p class="mt-2">No files match your filters.</p></div>');
        $("#vaultPagination").addClass("d-none");
        return;
    }

    files.forEach(file => {
        // Thumbnail Logic
        const isImg = file.media_type === 'image';
        const thumbSrc = isImg ? (file.thumbnail_url || file.file_url) : null;
        
        let iconHtml = '';
        let badgeClass = 'badge-document';
        
        if (file.media_type === 'video') { 
            iconHtml = '<i class="ri-movie-line file-icon-placeholder"></i>';
            badgeClass = 'badge-video';
        } else if (file.media_type === 'image') {
            badgeClass = 'badge-image';
        } else {
            iconHtml = '<i class="ri-file-text-line file-icon-placeholder"></i>';
        }

        const thumbHtml = thumbSrc 
            ? `<img src="${thumbSrc}" class="file-thumb-img" loading="lazy">` 
            : iconHtml;

        // Date Format
        const dateStr = new Date(file.created_at).toLocaleDateString();
        const sizeStr = file.file_size_mb ? file.file_size_mb.toFixed(1) + ' MB' : '-';

        // Store file data in element for modal
        const fileJson = encodeURIComponent(JSON.stringify(file));

        container.append(`
            <div class="col-6 col-md-4 col-lg-3">
                <div class="file-card" onclick="openPreview('${fileJson}')">
                    <div class="file-thumb-area">
                        ${thumbHtml}
                        <div class="file-type-badge ${badgeClass}">${file.media_type}</div>
                    </div>
                    <div class="file-info">
                        <div class="file-name text-truncate" title="${file.file_url.split('/').pop()}">
                            ${file.file_url.split('/').pop()}
                        </div>
                        <div class="file-meta">
                            <span>${sizeStr}</span>
                            <span>${dateStr}</span>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
    
    $("#vaultPagination").removeClass("d-none").addClass("d-flex");
}

// ==========================================
// 3. NAVIGATION & UI UTILS
// ==========================================

function resetToRoot() {
    loadFolders();
}

function updateBreadcrumbs() {
    const list = $("#vaultBreadcrumbs");
    // Always keep Root
    let html = `
        <li class="breadcrumb-item text-dark" onclick="resetToRoot()">
            <i class="ri-hard-drive-2-line me-2 text-warning"></i>Vault
        </li>
    `;

    if (currentView === 'files') {
        html += `
            <li class="breadcrumb-separator"><i class="ri-arrow-right-s-line"></i></li>
            <li class="breadcrumb-item active text-truncate" style="max-width: 200px;">
                ${currentFolderName}
            </li>
        `;
    }
    list.html(html);
}

function updatePaginationUI() {
    $("#paginationInfo").text(`Showing ${currentPage + 1}-${Math.min(currentPage + pageSize, totalFiles)} of ${totalFiles}`);
    $("#btnPrevPage").prop("disabled", currentPage === 0);
    $("#btnNextPage").prop("disabled", (currentPage + pageSize) >= totalFiles);
}

function renderSkeletons(count) {
    let html = '';
    for(let i=0; i<count; i++) {
        html += `
            <div class="col-6 col-md-4 col-lg-3">
                <div class="skeleton-loader" style="height: 200px; width: 100%;"></div>
            </div>
        `;
    }
    return html;
}

// ==========================================
// 4. PREVIEW MODAL
// ==========================================

function openPreview(fileDataEncoded) {
    const file = JSON.parse(decodeURIComponent(fileDataEncoded));
    const container = $("#previewContainer");
    
    // Metadata Sidebar
    $("#previewFileName").text(file.file_url.split('/').pop());
    $("#btnDownload").attr("href", file.file_url);
    $("#metaType").text(file.mime_type || 'Unknown');
    $("#metaSize").text(file.file_size_mb ? file.file_size_mb.toFixed(2) + ' MB' : '-');
    $("#metaDate").text(new Date(file.created_at).toLocaleString());
    $("#metaTask").text(file.task ? file.task.title : 'Unassigned Upload');
    
    const tagsContainer = $("#metaTags");
    tagsContainer.empty();
    if (file.tags) {
        file.tags.split(',').forEach(tag => {
            tagsContainer.append(`<span class="badge bg-light text-dark border">${tag}</span>`);
        });
    } else {
        tagsContainer.html('<span class="text-muted small">No tags</span>');
    }

    // Render Preview
    renderSmartPreview(file.file_url, container);
    $("#previewModal").modal("show");
}

// Reusing the Smart Preview Logic from Signature Module
function renderSmartPreview(url, container) {
    container.empty();
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Image
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        container.html(`<img src="${url}" class="preview-iframe" style="object-fit: contain; background: #111;">`);
        return;
    }
    // Video
    if (['mp4', 'mov', 'webm'].includes(ext)) {
        container.html(`<video src="${url}" class="preview-iframe" controls autoplay style="background: #000;"></video>`);
        return;
    }
    // PDF
    if (ext === 'pdf') {
        container.html(`<object data="${url}" type="application/pdf" class="preview-iframe" style="background:#525659;"></object>`);
        return;
    }
    // Word/Office
    if (['doc', 'docx', 'ppt', 'pptx', 'xlsx'].includes(ext)) {
        if (isLocalhost) {
            container.html(`
                <div class="text-center text-white">
                    <i class="ri-file-word-2-line" style="font-size: 4rem;"></i>
                    <h6 class="mt-3">Preview unavailable on Localhost</h6>
                    <a href="${url}" target="_blank" class="btn btn-light rounded-pill mt-2">Download</a>
                </div>
            `);
        } else {
            const vUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
            container.html(`<iframe src="${vUrl}" class="preview-iframe" style="background:white;"></iframe>`);
        }
        return;
    }
    // Fallback
    container.html(`
        <div class="text-center text-white">
            <i class="ri-file-unknow-line" style="font-size: 4rem;"></i>
            <h6 class="mt-3">Preview not available</h6>
            <a href="${url}" target="_blank" class="btn btn-light rounded-pill mt-2">Download File</a>
        </div>
    `);
}