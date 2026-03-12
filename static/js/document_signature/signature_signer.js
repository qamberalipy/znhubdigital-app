/**
 * signature_signer.js
 * Features: Pagination for History, Priority for Pending, Smart Signing Room.
 */

// Pagination State for History
let histPage = 0; // 0-based skip
let histLimit = 10;
let histTotal = 0;

$(document).ready(function() {
    loadPendingDocs();
    loadHistoryDocs();

    // Interaction Events
    $("#chkAgree, #inputLegalName").on("input change", validateSigningForm);
    $("#btnConfirmSign").on("click", submitSignature);

    // Pagination Events
    $("#btnPrevPage").on("click", function() {
        if (histPage > 0) {
            histPage -= histLimit;
            loadHistoryDocs();
        }
    });
    $("#btnNextPage").on("click", function() {
        if ((histPage + histLimit) < histTotal) {
            histPage += histLimit;
            loadHistoryDocs();
        }
    });
});

// ==========================================
// 1. DATA LOADING (SPLIT STREAMS)
// ==========================================

function loadPendingDocs() {
    // Fetch ALL pending documents (no limit, or high limit)
    axios.get('/api/signature/', { params: { status: 'Pending', limit: 100 } })
        .then(res => {
            renderPending(res.data.data);
        })
        .catch(err => {
            console.error(err);
            $("#pendingList").html('<div class="text-center text-danger py-4">Failed to load pending items.</div>');
        });
}

function loadHistoryDocs() {
    const container = $("#historyList");
    container.html('<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-secondary"></div> Loading History...</div>');

    // Fetch Signed documents with pagination
    axios.get('/api/signature/', { 
        params: { 
            status: 'Signed', 
            skip: histPage, 
            limit: histLimit 
        } 
    })
    .then(res => {
        histTotal = res.data.total;
        renderHistory(res.data.data);
        updatePaginationUI();
    })
    .catch(err => {
        console.error(err);
        container.html('<div class="text-center text-danger py-4">Failed to load history.</div>');
    });
}

// ==========================================
// 2. RENDERING
// ==========================================

function renderPending(docs) {
    const container = $("#pendingList");
    container.empty();
    $("#pendingCount").text(docs.length);

    if (docs.length === 0) {
        container.html('<div class="text-center py-4 text-muted"><i class="ri-check-double-line fs-1 d-block mb-2 text-success"></i>You are all caught up!</div>');
        return;
    }

    docs.forEach(doc => {
        const deadlineHtml = doc.deadline 
            ? `<span class="text-danger ms-2"><i class="ri-alarm-warning-line me-1"></i>Due: ${new Date(doc.deadline).toLocaleDateString()}</span>` 
            : '';

        container.append(`
            <div class="doc-item">
                <div class="doc-icon">
                    <i class="ri-file-text-line"></i>
                </div>
                <div class="doc-info">
                    <h6 class="doc-title">${doc.title}</h6>
                    <div class="doc-meta">
                        Requested by <strong class="text-dark">${doc.requester.full_name || 'Admin'}</strong>
                        ${deadlineHtml}
                    </div>
                </div>
                <div>
                    <button class="btn btn-sign" onclick="openSigningRoom(${doc.id})">
                        <i class="ri-pen-nib-line me-2"></i>Sign Now
                    </button>
                </div>
            </div>
        `);
    });
}

function renderHistory(docs) {
    const container = $("#historyList");
    container.empty();

    if (docs.length === 0) {
        container.html('<div class="text-center py-5 text-muted small">No signed documents found.</div>');
        return;
    }

    docs.forEach(doc => {
        const signedDate = doc.signed_at 
            ? `Signed on ${new Date(doc.signed_at).toLocaleDateString()}` 
            : 'Signed';

        // Fix smart view link
        const ext = doc.document_url.split('.').pop().toLowerCase();
        let viewUrl = doc.document_url;
        if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
            viewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(doc.document_url)}`;
        }

        container.append(`
            <div class="doc-item opacity-75">
                <div class="doc-icon bg-light text-muted">
                    <i class="ri-checkbox-circle-line"></i>
                </div>
                <div class="doc-info">
                    <h6 class="doc-title text-muted">${doc.title}</h6>
                    <div class="doc-meta">
                        <span class="badge bg-success text-white me-2">Signed</span>
                        ${signedDate}
                    </div>
                </div>
                <div>
                    <a href="${viewUrl}" target="_blank" class="btn btn-view">
                        <i class="ri-eye-line me-1"></i>View
                    </a>
                </div>
            </div>
        `);
    });
}

function updatePaginationUI() {
    const end = Math.min(histPage + histLimit, histTotal);
    $("#paginationInfo").text(`Showing ${histPage + 1}-${end} of ${histTotal}`);
    
    $("#btnPrevPage").prop("disabled", histPage === 0);
    $("#btnNextPage").prop("disabled", (histPage + histLimit) >= histTotal);
}

// ==========================================
// 3. SIGNING LOGIC
// ==========================================

let currentSigningId = null;

function openSigningRoom(id) {
    axios.get(`/api/signature/${id}`)
        .then(res => {
            const doc = res.data;
            currentSigningId = doc.id;

            $("#signDocTitle").text(doc.title);
            $("#signRequesterName").text(doc.requester.full_name || "Admin");
            $("#signDescription").text(doc.description || "No description provided.");
            $("#signDeadline").text(doc.deadline ? new Date(doc.deadline).toLocaleDateString() : "No Deadline");

            // Reset Form
            $("#chkAgree").prop("checked", false);
            $("#inputLegalName").val("");
            $("#btnConfirmSign").prop("disabled", true).text("Sign & Submit").removeClass("btn-sign").addClass("btn-secondary");

            renderSmartPreview(doc.document_url, $("#docPreviewContainer"));
            $("#signingRoomModal").modal("show");
        })
        .catch(err => toastr.error("Failed to load document."));
}

function validateSigningForm() {
    const isChecked = $("#chkAgree").is(":checked");
    const name = $("#inputLegalName").val().trim();
    
    if (isChecked && name.length >= 3) {
        $("#btnConfirmSign").prop("disabled", false).removeClass("btn-secondary").addClass("btn-sign");
    } else {
        $("#btnConfirmSign").prop("disabled", true).removeClass("btn-sign").addClass("btn-secondary");
    }
}

function submitSignature() {
    if (!currentSigningId) return;
    const legalName = $("#inputLegalName").val().trim();
    const btn = $("#btnConfirmSign");

    btn.prop("disabled", true).html('<div class="spinner-border spinner-border-sm me-2"></div>Signing...');

    axios.post(`/api/signature/${currentSigningId}/sign`, { legal_name: legalName })
        .then(() => {
            toastr.success("Document Signed Successfully!");
            $("#signingRoomModal").modal("hide");
            
            // Reload both lists to move item from Pending to History
            loadPendingDocs();
            histPage = 0; // Reset history to page 1
            loadHistoryDocs();
        })
        .catch(err => {
            toastr.error(err.response?.data?.detail || "Signing failed.");
            btn.prop("disabled", false).text("Sign & Submit");
        });
}

function renderSmartPreview(url, container) {
    container.empty();
    const filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
    const ext = filename.split('.').pop().toLowerCase();
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (ext === 'pdf') {
        container.html(`<object data="${url}" type="application/pdf" class="preview-iframe" style="background:#525659;"></object>`);
    } else if (['doc', 'docx', 'ppt', 'xlsx'].includes(ext)) {
        if (isLocalhost) {
            container.html(`<div class="text-center text-white"><p>Preview unavailable on Localhost.</p><a href="${url}" target="_blank" class="btn btn-light btn-sm">Download</a></div>`);
        } else {
            const vUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
            container.html(`<iframe src="${vUrl}" class="preview-iframe" style="background:white;"></iframe>`);
        }
    } else {
        container.html(`<img src="${url}" class="preview-iframe" style="object-fit:contain; background:#222;">`);
    }
}