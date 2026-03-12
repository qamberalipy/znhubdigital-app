/**
 * signature_assigner.js
 * Handles Signatures, Editing (with Doc Update), and "Assigned By" Logic
 */

let currentPage = 0;
let pageSize = 10;
let totalRecords = 0;
let currentUserId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
let currentUserRole = $('meta[name="user-role"]').attr('content') || '';

$(document).ready(function() {
    loadSignatures();
    loadAssignees();

    if (currentUserRole === 'digital_creator') {
        $("#btnOpenCreateModal").hide();
    }

    // --- Global Events ---
    $("#filterSearch").on("keypress", function(e) { if(e.which === 13) { currentPage=0; loadSignatures(); }});
    $("#filterStatus").on("change", function() { currentPage=0; loadSignatures(); });
    $("#btnPrevPage").on("click", function() { if(currentPage > 0) { currentPage-=pageSize; loadSignatures(); }});
    $("#btnNextPage").on("click", function() { if((currentPage+pageSize)<totalRecords) { currentPage+=pageSize; loadSignatures(); }});

    // --- Upload Events ---
    $("#hiddenFileInput").on("change", handleDocumentUpload);

    // --- Form Submit ---
    $("#createForm").on("submit", handleCreateRequest);
    $("#signForm").on("submit", handleSignDocument);
});

// ==========================================
// 1. UPLOAD & PREVIEW LOGIC
// ==========================================

function triggerFileUpload() {
    // Prevent upload click only if specifically disabled (e.g., during upload)
    if ($("#uploadState").hasClass("disabled")) return;
    $("#hiddenFileInput").click();
}

function handleDocumentUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    $("#uploadState").addClass("disabled");
    $("#uploadSpinner").removeClass("d-none");
    
    const formData = new FormData();
    formData.append("file", file);

    // Using query param for type_group to fix backend validation
    axios.post('/api/upload/small-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { type_group: 'document' }
    })
    .then(res => {
        const url = res.data.url;
        const filename = res.data.filename;
        const mime = file.type;

        $("#reqDocUrl").val(url);
        renderPreview(url, mime, filename);
        toastr.success("Document uploaded successfully");
    })
    .catch(err => {
        toastr.error(err.response?.data?.detail || "Upload failed");
        $("#uploadSpinner").addClass("d-none");
        $("#uploadState").removeClass("disabled");
        $("#hiddenFileInput").val(""); 
    });
}

function renderPreview(url, mime, filename) {
    // 1. Switch UI to Preview Mode
    $("#uploadState").addClass("d-none").removeClass("disabled");
    $("#previewState").removeClass("d-none");
    $("#uploadSpinner").addClass("d-none");

    const container = $("#previewContent");
    container.empty();
    
    // Helper to get extension
    const ext = filename ? filename.split('.').pop().toLowerCase() : '';
    
    // CHECK: Are we on Localhost?
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // --- A. PDF (Native Browser Viewer) ---
    if (mime.includes("pdf") || ext === 'pdf') {
        container.html(`
            <object data="${url}" type="application/pdf" class="preview-iframe" style="background:#525659; width:100%; height:100%; border-radius: 8px;">
                <div class="file-icon-fallback">
                    <i class="ri-file-pdf-line text-danger fs-1"></i>
                    <p class="mt-2 text-muted">Preview not supported.</p>
                    <a href="${url}" target="_blank" class="btn btn-sm btn-outline-dark">Download PDF</a>
                </div>
            </object>
        `);
        return;
    }

    // --- B. WORD DOCUMENTS (Microsoft Office Viewer) ---
    if (mime.includes("word") || mime.includes("officedocument") || ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
        
        // IF LOCALHOST: Show "Preview Unavailable" Card
        if (isLocalhost) {
             container.html(`
                <div class="file-icon-fallback" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8f9fa; border-radius: 8px;">
                    <i class="ri-file-word-2-line text-primary" style="font-size: 4rem;"></i>
                    <h6 class="mt-3 text-dark fw-bold text-truncate w-75 text-center">${filename}</h6>
                    
                    <div class="alert alert-warning py-2 px-3 mt-2 mb-3 small text-center" style="max-width: 90%;">
                        <i class="ri-alert-line me-1"></i>
                        <strong>Localhost Detected:</strong><br>
                        Microsoft Viewer cannot preview files on your local computer.
                    </div>

                    <a href="${url}" target="_blank" class="btn btn-grail-gold btn-sm px-4 rounded-pill">
                        <i class="ri-download-line me-1"></i> Download to View
                    </a>
                </div>
            `);
            return;
        }

        // IF LIVE SERVER: Use Microsoft Viewer
        const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
        container.html(`
            <iframe src="${viewerUrl}" class="preview-iframe" frameborder="0" style="background:#fff; width:100%; height:100%; border-radius: 8px;"></iframe>
        `);
        return;
    }

    // --- C. FALLBACK (Images/Other) ---
    if (mime.includes("image") || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
         container.html(`<img src="${url}" class="preview-iframe" style="object-fit: contain; background:#f8f9fa; width:100%; height:100%; border-radius: 8px;" alt="Preview">`);
         return;
    }

    container.html(`
        <div class="file-icon-fallback" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <i class="ri-file-text-line text-primary" style="font-size: 4rem;"></i>
            <h6 class="mt-3 text-dark text-truncate w-75 fw-bold">${filename}</h6>
            <a href="${url}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">Download to View</a>
        </div>
    `);
}

function removeDocument() {
    $("#reqDocUrl").val("");
    $("#hiddenFileInput").val("");
    $("#previewState").addClass("d-none");
    $("#uploadState").removeClass("d-none").removeClass("disabled");
    $("#uploadSpinner").addClass("d-none");
}

// ==========================================
// 2. CREATE & EDIT REQUEST LOGIC
// ==========================================

function loadAssignees() {
    axios.get('/api/tasks/assignees') 
        .then(res => {
            const select = $("#reqSigner");
            select.empty().append('<option value="">Select Creator...</option>');
            res.data.forEach(u => {
                select.append(`<option value="${u.id}">${u.full_name || u.username}</option>`);
            });
        })
        .catch(err => console.log("Assignee load error", err));
}

function resetForm() {
    $("#createForm")[0].reset();
    $("#editRequestId").val(""); // Clear Edit ID
    $("#modalTitle").text("Request Signature");
    $("#btnSubmitRequest").text("Send Request");
    
    // Enable Signer & Upload
    $("#reqSigner").prop("disabled", false);
    
    // Reset Upload UI
    $("#btnRemoveDoc").show();
    $("#uploadState").removeClass("disabled");
    
    removeDocument(); 
}

function openCreateModal() {
    resetForm();
    $("#createModal").modal("show");
}

function openEditModal(id) {
    resetForm();
    
    axios.get(`/api/signature/${id}`)
        .then(res => {
            const data = res.data;
            
            // Set Form Values
            $("#editRequestId").val(data.id);
            $("#reqTitle").val(data.title);
            $("#reqDesc").val(data.description);
            $("#reqSigner").val(data.signer.id).prop("disabled", true); // Disable Signer change
            
            if (data.deadline) {
                const d = new Date(data.deadline);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                $("#reqDeadline").val(d.toISOString().slice(0, 16));
            }

            // Handle Document
            $("#reqDocUrl").val(data.document_url);

            // Detect File Type
            const url = data.document_url;
            const filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || "document.file";
            const ext = filename.split('.').pop().toLowerCase();

            let mime = "application/octet-stream";
            if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) mime = "image/jpeg";
            else if (ext === 'pdf') mime = "application/pdf";
            else if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

            renderPreview(url, mime, filename);

            // --- CHANGED: Allow removing/updating document ---
            $("#btnRemoveDoc").show(); // Show remove button
            // Removed: $("#uploadState").addClass("disabled-mode"); 

            // UI Changes for Edit Mode
            $("#modalTitle").text("Edit Request");
            $("#btnSubmitRequest").text("Update Request");

            $("#createModal").modal("show");
        })
        .catch(err => toastr.error("Failed to load request details"));
}

function handleCreateRequest(e) {
    e.preventDefault();
    const docUrl = $("#reqDocUrl").val();
    if (!docUrl) { toastr.warning("Please upload a document first."); return; }

    const editId = $("#editRequestId").val();
    const isEdit = !!editId;

    const payload = {
        title: $("#reqTitle").val(),
        description: $("#reqDesc").val(),
        document_url: docUrl, // --- CHANGED: Send document_url in both Create and Edit
        deadline: $("#reqDeadline").val() ? new Date($("#reqDeadline").val()).toISOString() : null
    };

    // Add Create-only fields
    if (!isEdit) {
        payload.signer_id = parseInt($("#reqSigner").val());
    }

    const btn = $("#btnSubmitRequest");
    btn.prop("disabled", true).text(isEdit ? "Updating..." : "Sending...");

    const request = isEdit 
        ? axios.put(`/api/signature/${editId}`, payload)
        : axios.post('/api/signature/', payload);

    request
        .then(() => {
            toastr.success(isEdit ? "Request Updated" : "Request Sent");
            $("#createModal").modal("hide");
            loadSignatures();
        })
        .catch(err => {
            toastr.error(err.response?.data?.detail || "Operation failed");
        })
        .finally(() => btn.prop("disabled", false).text(isEdit ? "Update Request" : "Send Request"));
}

// ==========================================
// 3. READ & SIGN & TABLE LOGIC
// ==========================================

function loadSignatures() {
    const tbody = $("#signatureTableBody");
    tbody.html(`<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-warning"></div></td></tr>`);

    const params = {
        skip: currentPage,
        limit: pageSize,
        search: $("#filterSearch").val(),
        status: $("#filterStatus").val()
    };

    axios.get('/api/signature/', { params: params })
        .then(res => {
            const data = res.data.data; 
            totalRecords = res.data.total;
            renderTable(data);
            updatePaginationUI();
        })
        .catch(err => {
            console.error(err);
            tbody.html(`<tr><td colspan="7" class="text-center text-muted py-4">No signatures found.</td></tr>`);
        });
}

function renderTable(requests) {
    const tbody = $("#signatureTableBody");
    tbody.empty();
    
    if (requests.length === 0) {
        tbody.html(`<tr><td colspan="7" class="text-center text-muted py-5">No signatures found.</td></tr>`);
        return;
    }

    requests.forEach(req => {
        let badgeClass = 'badge-pending';
        if (req.status === 'Signed') badgeClass = 'badge-signed';
        else if (req.status === 'Expired' || req.status === 'Declined') badgeClass = 'badge-expired';

        // Permissions
        const isSigner = (req.signer.id === currentUserId);
        const isRequester = (req.requester.id === currentUserId);
        const isAdmin = currentUserRole === 'admin';

        // --- Assigned By Logic ---
        let assignedByHtml = '';
        if (isRequester) {
            assignedByHtml = `<span class="fw-bold text-dark bg-light px-2 py-1 rounded small">Me</span>`;
        } else {
            const requesterName = req.requester.full_name || req.requester.username || 'Unknown';
            assignedByHtml = `<span class="small text-muted">${requesterName}</span>`;
        }

        // --- SIGNED DATE & LEGAL NAME LOGIC ---
        let signedInfoHtml = '<span class="text-muted">-</span>';
        if (req.signed_at) {
            const dateStr = new Date(req.signed_at).toLocaleDateString();
            const legalName = req.signed_legal_name ? `<div class="text-xs text-muted">As: "<strong>${req.signed_legal_name}</strong>"</div>` : '';
            signedInfoHtml = `
                <div class="d-flex flex-column">
                    <span class="small text-dark fw-medium">${dateStr}</span>
                    ${legalName}
                </div>
            `;
        }

        // Actions
        let actionButtons = '';
        
        // 1. View (Smart Link)
        const ext = req.document_url.split('.').pop().toLowerCase();
        let viewUrl = req.document_url;
        if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
            viewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(req.document_url)}`;
        }

        actionButtons += `<a href="${viewUrl}" target="_blank" class="ri-eye-line action-icon me-2" title="View Document"></a>`;
        
        // Buttons ONLY appear if NOT Signed
        if (req.status !== 'Signed') {
            // Edit
            if ((isRequester || isAdmin)) {
                actionButtons += `<i class="ri-pencil-line action-icon me-2" title="Edit Request" onclick="openEditModal(${req.id})"></i>`;
            }
            // Sign (for Signer)
            if (isSigner) {
                actionButtons += `<i class="ri-pen-nib-line action-icon me-2 text-warning" title="Sign Now" onclick="openSignModal(${req.id}, '${req.title}', '${req.document_url}')"></i>`;
            }
            // Delete
            if ((isRequester || isAdmin)) {
                actionButtons += `<i class="ri-delete-bin-line action-icon delete" title="Delete" onclick="deleteRequest(${req.id})"></i>`;
            }
        } else {
            // If signed, show a checkmark or lock instead of actions
            actionButtons += `<i class="ri-checkbox-circle-fill text-success" title="Completed"></i>`;
        }

        const deadlineDate = req.deadline ? new Date(req.deadline).toLocaleDateString() : '-';
        
        tbody.append(`
            <tr>
                <td>
                    <div class="d-flex flex-column">
                        <span class="fw-bold text-dark">${req.title}</span>
                        <span class="text-xs text-muted text-truncate" style="max-width: 200px;">${req.description || ''}</span>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${req.signer.profile_picture_url || 'https://ui-avatars.com/api/?background=random&name='+req.signer.full_name}" class="user-avatar-small">
                        <span class="small fw-medium">${req.signer.full_name || 'User'}</span>
                    </div>
                </td>
                <td>${assignedByHtml}</td> 
                <td><span class="badge-status ${badgeClass}">${req.status}</span></td>
                <td><span class="small text-dark">${deadlineDate}</span></td>
                <td>${signedInfoHtml}</td> <td class="text-end">${actionButtons}</td>
            </tr>
        `);
    });
}

function updatePaginationUI() {
    $("#paginationInfo").text(`Showing ${currentPage + 1}-${Math.min(currentPage + pageSize, totalRecords)} of ${totalRecords}`);
    $("#btnPrevPage").prop("disabled", currentPage === 0);
    $("#btnNextPage").prop("disabled", (currentPage + pageSize) >= totalRecords);
}

function openSignModal(id, title, url) {
    $("#signRequestId").val(id);
    $("#signDocTitle").text(title);
    
    const ext = url.split('.').pop().toLowerCase();
    let viewUrl = url;
    if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
        viewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
    }
    $("#viewDocBtn").attr("href", viewUrl);
    
    $("#legalName").val("");
    $("#signModal").modal("show");
}

function handleSignDocument(e) {
    e.preventDefault();
    const id = $("#signRequestId").val();
    const legalName = $("#legalName").val().trim();
    if (legalName.length < 3) { toastr.warning("Please enter your full legal name."); return; }

    $("#btnSubmitSign").prop("disabled", true).text("Signing...");
    axios.post(`/api/signature/${id}/sign`, { legal_name: legalName })
        .then(() => {
            toastr.success("Document Signed!");
            $("#signModal").modal("hide");
            loadSignatures();
        })
        .catch(err => toastr.error(err.response?.data?.detail || "Signing failed"))
        .finally(() => $("#btnSubmitSign").prop("disabled", false).text("Confirm & Sign"));
}

function deleteRequest(id) {
    Swal.fire({
        title: 'Retract Request?', text: "This will delete the signature request.", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Delete'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.delete(`/api/signature/${id}`)
                .then(() => { toastr.success("Deleted"); loadSignatures(); })
                .catch(err => toastr.error(err.response?.data?.detail || "Failed to delete"));
        }
    });
}