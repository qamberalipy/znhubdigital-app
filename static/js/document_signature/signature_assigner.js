/**
 * signature_assigner.js
 * ZN Hub Refactor: Staff assigning documents to Clients.
 */

let currentPage = 0;
let pageSize = 10;
let totalRecords = 0;
let currentUserId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
let currentUserRole = $('meta[name="user-role"]').attr('content') || '';

$(document).ready(function() {
    loadSignatures();
    loadAssignees();

    // ZN HUB RBAC: Only staff can create signature requests. Clients cannot.
    if (currentUserRole === 'client') {
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
});

// ==========================================
// 1. UPLOAD & PREVIEW LOGIC
// ==========================================

function triggerFileUpload() {
    if ($("#uploadState").hasClass("disabled")) return;
    $("#fileError").hide();
    $("#hiddenFileInput").click();
}

function handleDocumentUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // File Size Validation (10MB)
    if (file.size > 10 * 1024 * 1024) {
        toastr.error("File size must be less than 10MB");
        $("#hiddenFileInput").val(""); 
        return;
    }

    $("#uploadState").addClass("disabled");
    $("#uploadSpinner").removeClass("d-none");
    
    const formData = new FormData();
    formData.append("file", file);

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
        toastr.success("Document encrypted and uploaded.");
    })
    .catch(err => {
        toastr.error(err.response?.data?.detail || "Upload failed");
        $("#uploadSpinner").addClass("d-none");
        $("#uploadState").removeClass("disabled");
        $("#hiddenFileInput").val(""); 
    });
}

function renderPreview(url, mime, filename) {
    $("#uploadState").addClass("d-none").removeClass("disabled");
    $("#previewState").removeClass("d-none");
    $("#uploadSpinner").addClass("d-none");

    const container = $("#previewContent");
    container.empty();
    
    const ext = filename ? filename.split('.').pop().toLowerCase() : '';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // PDF Preview
    if (mime.includes("pdf") || ext === 'pdf') {
        container.html(`
            <object data="${url}" type="application/pdf" class="preview-iframe" style="background:#525659; border-radius: 8px;">
                <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light">
                    <i class="ri-file-pdf-line text-danger fs-1"></i>
                    <p class="mt-2 text-muted fw-bold">Browser preview not supported.</p>
                    <a href="${url}" target="_blank" class="btn btn-sm btn-outline-dark">Download PDF</a>
                </div>
            </object>
        `);
        return;
    }

    // Word Doc Preview
    if (mime.includes("word") || ['doc', 'docx'].includes(ext)) {
        if (isLocalhost) {
             container.html(`
                <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light p-4 text-center border-radius-8">
                    <i class="ri-file-word-2-fill text-primary" style="font-size: 4rem;"></i>
                    <h6 class="mt-3 text-dark fw-bold text-truncate w-100">${filename}</h6>
                    <div class="alert alert-warning py-2 px-3 mt-3 small w-100">
                        <strong>Localhost:</strong> Microsoft Viewer cannot render local files.
                    </div>
                </div>
            `);
            return;
        }
        const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
        container.html(`<iframe src="${viewerUrl}" class="preview-iframe" frameborder="0" style="border-radius: 8px;"></iframe>`);
        return;
    }

    // Fallback
    container.html(`
        <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light text-center p-4">
            <i class="ri-file-text-fill text-secondary" style="font-size: 4rem;"></i>
            <h6 class="mt-3 text-dark text-truncate w-100 fw-bold">${filename}</h6>
            <a href="${url}" target="_blank" class="btn btn-sm btn-dark mt-3 px-4">Download</a>
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
// 2. FORM ACTIONS & API
// ==========================================

// ==========================================
// 2. FORM ACTIONS & API
// ==========================================

function loadAssignees() {
    // Calling the User CRUD API with role=client to fetch only clients
    axios.get('/api/users/', { 
        params: { 
            role: 'client', 
            limit: 100, // Pass a high limit to ensure all clients are loaded
            skip: 0
        } 
    })
    .then(res => {
        const select = $("#reqSigner");
        select.empty().append('<option value="" disabled selected>Select Client...</option>');
        
        // Loop through the returned list of UserOut schemas
        res.data.forEach(client => {
            // Fallback to username if full_name is not set
            const displayName = client.full_name || client.username || `Client #${client.id}`;
            select.append(`<option value="${client.id}">${displayName}</option>`);
        });
    })
    .catch(err => {
        console.error("Client load error:", err);
        toastr.error("Failed to load the client list.");
        $("#reqSigner").empty().append('<option value="" disabled>Error loading clients</option>');
    });
}
function resetForm() {
    const form = $("#createForm")[0];
    form.reset();
    form.classList.remove('was-validated');
    
    $("#editRequestId").val(""); 
    $("#modalTitle").text("Request Client Signature");
    $("#btnSubmitRequest").html('<i class="ri-send-plane-fill me-2"></i>Send Request');
    $("#fileError").hide();
    
    $("#reqSigner").prop("disabled", false);
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
            $("#editRequestId").val(data.id);
            $("#reqTitle").val(data.title);
            $("#reqDesc").val(data.description);
            $("#reqSigner").val(data.signer.id).prop("disabled", true); 
            
            if (data.deadline) {
                const d = new Date(data.deadline);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                $("#reqDeadline").val(d.toISOString().slice(0, 16));
            }

            $("#reqDocUrl").val(data.document_url);
            const url = data.document_url;
            const filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || "document.file";
            const ext = filename.split('.').pop().toLowerCase();

            let mime = "application/octet-stream";
            if (ext === 'pdf') mime = "application/pdf";
            else if (['doc', 'docx'].includes(ext)) mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

            renderPreview(url, mime, filename);

            $("#modalTitle").text("Edit Signature Request");
            $("#btnSubmitRequest").html('<i class="ri-save-3-fill me-2"></i>Update Request');

            $("#createModal").modal("show");
        })
        .catch(err => toastr.error("Failed to load request details"));
}

function handleCreateRequest(e) {
    e.preventDefault();
    const form = $("#createForm")[0];
    
    // HTML5 Validation Check
    if (!form.checkValidity()) {
        e.stopPropagation();
        form.classList.add('was-validated');
        return;
    }

    const docUrl = $("#reqDocUrl").val();
    if (!docUrl) { 
        $("#fileError").show();
        return; 
    }

    const editId = $("#editRequestId").val();
    const isEdit = !!editId;

    const payload = {
        title: $("#reqTitle").val(),
        description: $("#reqDesc").val(),
        document_url: docUrl,
        deadline: $("#reqDeadline").val() ? new Date($("#reqDeadline").val()).toISOString() : null
    };

    if (!isEdit) payload.signer_id = parseInt($("#reqSigner").val());

    const btn = $("#btnSubmitRequest");
    btn.prop("disabled", true).html('<span class="spinner-border spinner-border-sm me-2"></span>Processing...');

    const request = isEdit 
        ? axios.put(`/api/signature/${editId}`, payload)
        : axios.post('/api/signature/', payload);

    request
        .then(() => {
            toastr.success(isEdit ? "Signature Request Updated" : "Signature Request Sent to Client");
            $("#createModal").modal("hide");
            loadSignatures();
        })
        .catch(err => {
            toastr.error(err.response?.data?.detail || "Operation failed due to a server error.");
        })
        .finally(() => btn.prop("disabled", false).html(isEdit ? '<i class="ri-save-3-fill me-2"></i>Update Request' : '<i class="ri-send-plane-fill me-2"></i>Send Request'));
}

// ==========================================
// 3. TABLE RENDERING
// ==========================================

function loadSignatures() {
    const tbody = $("#signatureTableBody");
    tbody.html(`<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-warning"></div></td></tr>`);

    axios.get('/api/signature/', { 
        params: { skip: currentPage, limit: pageSize, search: $("#filterSearch").val(), status: $("#filterStatus").val() } 
    }).then(res => {
        const data = res.data.data; 
        totalRecords = res.data.total;
        renderTable(data);
        updatePaginationUI();
    }).catch(err => {
        tbody.html(`<tr><td colspan="7" class="text-center text-danger py-4 fw-bold">Error loading documents.</td></tr>`);
    });
}

function renderTable(requests) {
    const tbody = $("#signatureTableBody");
    tbody.empty();
    
    if (requests.length === 0) {
        tbody.html(`<tr><td colspan="7" class="text-center text-muted py-5"><i class="ri-folder-open-line fs-1 d-block mb-2"></i>No signatures found for this criteria.</td></tr>`);
        return;
    }

    requests.forEach(req => {
        let badgeClass = req.status === 'Signed' ? 'badge-signed' : (req.status === 'Pending' ? 'badge-pending' : 'badge-expired');

        const isRequester = (req.requester.id === currentUserId);
        const isAdmin = currentUserRole === 'admin';

        let assignedByHtml = isRequester 
            ? `<span class="fw-bold text-dark bg-light px-2 py-1 rounded small border">Me</span>` 
            : `<span class="small fw-medium text-secondary">${req.requester.full_name || 'Staff Member'}</span>`;

        let signedInfoHtml = '<span class="text-muted">-</span>';
        if (req.signed_at) {
            signedInfoHtml = `
                <div class="d-flex flex-column">
                    <span class="small text-dark fw-bold"><i class="ri-check-double-line text-success me-1"></i>${new Date(req.signed_at).toLocaleDateString()}</span>
                    ${req.signed_legal_name ? `<div class="text-xs text-muted mt-1">Signatory: "<strong>${req.signed_legal_name}</strong>"</div>` : ''}
                </div>
            `;
        }

        let actionButtons = '';
        const ext = req.document_url.split('.').pop().toLowerCase();
        let viewUrl = ['doc', 'docx'].includes(ext) ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(req.document_url)}` : req.document_url;

        actionButtons += `<a href="${viewUrl}" target="_blank" class="ri-eye-line action-icon me-1" title="View Document"></a>`;
        
        if (req.status !== 'Signed') {
            if (isRequester || isAdmin) {
                actionButtons += `<i class="ri-pencil-line action-icon me-1 text-primary" title="Edit Request" onclick="openEditModal(${req.id})"></i>`;
                actionButtons += `<i class="ri-delete-bin-line action-icon delete" title="Retract Request" onclick="deleteRequest(${req.id})"></i>`;
            }
        } else {
            actionButtons += `<span class="badge bg-success ms-2"><i class="ri-lock-line me-1"></i>Locked</span>`;
        }

        tbody.append(`
            <tr class="align-middle">
                <td>
                    <div class="d-flex flex-column">
                        <span class="fw-bold text-dark fs-6">${req.title}</span>
                        <span class="text-xs text-muted text-truncate mt-1" style="max-width: 250px;">${req.description || 'No description provided'}</span>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${req.signer.profile_picture_url || 'https://ui-avatars.com/api/?background=2C3E50&color=fff&name='+req.signer.full_name}" class="user-avatar-small shadow-sm">
                        <span class="small fw-bold text-dark">${req.signer.full_name || 'Unknown Client'}</span>
                    </div>
                </td>
                <td>${assignedByHtml}</td> 
                <td><span class="badge-status ${badgeClass}">${req.status}</span></td>
                <td><span class="small fw-medium ${req.deadline ? 'text-danger' : 'text-muted'}">${req.deadline ? new Date(req.deadline).toLocaleDateString() : 'None'}</span></td>
                <td>${signedInfoHtml}</td> 
                <td class="text-end text-nowrap">${actionButtons}</td>
            </tr>
        `);
    });
}

function updatePaginationUI() {
    $("#paginationInfo").text(`Showing ${totalRecords === 0 ? 0 : currentPage + 1}-${Math.min(currentPage + pageSize, totalRecords)} of ${totalRecords}`);
    $("#btnPrevPage").prop("disabled", currentPage === 0);
    $("#btnNextPage").prop("disabled", (currentPage + pageSize) >= totalRecords);
}

function deleteRequest(id) {
    Swal.fire({
        title: 'Retract Document?', 
        text: "This will permanently delete the signature request. The client will no longer be able to sign it.", 
        icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#DC2626', confirmButtonText: 'Yes, Retract It'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.delete(`/api/signature/${id}`)
                .then(() => { toastr.success("Document Retracted"); loadSignatures(); })
                .catch(err => toastr.error(err.response?.data?.detail || "Failed to retract"));
        }
    });
}