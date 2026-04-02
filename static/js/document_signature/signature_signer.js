/**
 * signature_signer.js
 * ZN Hub Refactor: Client Portal for reviewing and securely signing documents.
 */

let histPage = 0; 
let histLimit = 10;
let histTotal = 0;
let currentSigningId = null;

$(document).ready(function() {
    loadPendingDocs();
    loadHistoryDocs();

    // Interaction Events
    $("#chkAgree, #inputLegalName").on("input change", validateSigningForm);
    
    // Secure Form Submit
    $("#signForm").on("submit", submitSignature);

    // Pagination Events
    $("#btnPrevPage").on("click", function() {
        if (histPage > 0) { histPage -= histLimit; loadHistoryDocs(); }
    });
    $("#btnNextPage").on("click", function() {
        if ((histPage + histLimit) < histTotal) { histPage += histLimit; loadHistoryDocs(); }
    });
});

// ==========================================
// 1. DATA LOADING
// ==========================================

function loadPendingDocs() {
    axios.get('/api/signature/', { params: { status: 'Pending', limit: 100 } })
        .then(res => renderPending(res.data.data))
        .catch(err => $("#pendingList").html('<div class="text-center text-danger py-4 fw-bold">Failed to connect to secure server.</div>'));
}

function loadHistoryDocs() {
    const container = $("#historyList");
    container.html('<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-secondary me-2"></div> Loading Archive...</div>');

    axios.get('/api/signature/', { params: { status: 'Signed', skip: histPage, limit: histLimit } })
    .then(res => {
        histTotal = res.data.total;
        renderHistory(res.data.data);
        updatePaginationUI();
    })
    .catch(err => container.html('<div class="text-center text-danger py-4 fw-bold">Failed to load document archive.</div>'));
}

// ==========================================
// 2. RENDERING
// ==========================================

function renderPending(docs) {
    const container = $("#pendingList");
    container.empty();
    $("#pendingCount").text(docs.length);

    if (docs.length === 0) {
        container.html(`
            <div class="text-center py-5 text-muted">
                <i class="ri-shield-check-line fs-1 d-block mb-3 text-success"></i>
                <h5 class="fw-bold text-dark">You're all caught up!</h5>
                <p class="small">There are no pending documents requiring your signature.</p>
            </div>
        `);
        return;
    }

    docs.forEach(doc => {
        const deadlineHtml = doc.deadline 
            ? `<span class="badge bg-danger text-white ms-3 px-2 py-1 rounded"><i class="ri-alarm-warning-fill me-1"></i>Due: ${new Date(doc.deadline).toLocaleDateString()}</span>` 
            : '';

        container.append(`
            <div class="doc-item shadow-sm">
                <div class="doc-icon"><i class="ri-file-warning-fill"></i></div>
                <div class="doc-info">
                    <h6 class="doc-title">${doc.title}</h6>
                    <div class="doc-meta">
                        <span class="text-dark fw-medium">Issued by ${doc.requester.full_name || 'ZN Hub Admin'}</span>
                        ${deadlineHtml}
                    </div>
                </div>
                <div>
                    <button class="btn btn-sign px-4" onclick="openSigningRoom(${doc.id})">
                        <i class="ri-lock-unlock-fill me-2"></i>Review & Sign
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
        container.html('<div class="text-center py-5 text-muted fw-medium border rounded bg-light">No executed documents found in your archive.</div>');
        return;
    }

    docs.forEach(doc => {
        const ext = doc.document_url.split('.').pop().toLowerCase();
        let viewUrl = ['doc', 'docx'].includes(ext) ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(doc.document_url)}` : doc.document_url;

        container.append(`
            <div class="doc-item opacity-75 bg-light">
                <div class="doc-icon bg-white border text-success"><i class="ri-checkbox-circle-fill"></i></div>
                <div class="doc-info">
                    <h6 class="doc-title text-muted mb-1">${doc.title}</h6>
                    <div class="doc-meta">
                        <span class="badge bg-success text-white px-2 py-1 me-2"><i class="ri-check-line me-1"></i>Executed</span>
                        <span class="fw-bold text-dark">Signed on ${new Date(doc.signed_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <div>
                    <a href="${viewUrl}" target="_blank" class="btn btn-view bg-white shadow-sm">
                        <i class="ri-download-cloud-2-line me-2"></i>Download Copy
                    </a>
                </div>
            </div>
        `);
    });
}

function updatePaginationUI() {
    const end = Math.min(histPage + histLimit, histTotal);
    $("#paginationInfo").text(`Showing ${histTotal === 0 ? 0 : histPage + 1}-${end} of ${histTotal}`);
    $("#btnPrevPage").prop("disabled", histPage === 0);
    $("#btnNextPage").prop("disabled", (histPage + histLimit) >= histTotal);
}

// ==========================================
// 3. SECURE SIGNING LOGIC
// ==========================================

function openSigningRoom(id) {
    axios.get(`/api/signature/${id}`)
        .then(res => {
            const doc = res.data;
            currentSigningId = doc.id;

            $("#signDocTitle").text(doc.title);
            $("#signRequesterName").text(doc.requester.full_name || "ZN Hub Representative");
            $("#signDescription").text(doc.description || "Review the document carefully before applying your signature.");
            $("#signDeadline").text(doc.deadline ? new Date(doc.deadline).toLocaleDateString() : "No Expiration");

            // Hard Reset Form
            const form = $("#signForm")[0];
            form.reset();
            form.classList.remove('was-validated');
            $("#btnConfirmSign").prop("disabled", true).html('<i class="ri-pen-nib-fill me-2"></i>Apply Signature & Complete');

            renderSmartPreview(doc.document_url, $("#docPreviewContainer"));
            $("#signingRoomModal").modal("show");
        })
        .catch(err => toastr.error("Failed to decrypt and load document."));
}

function validateSigningForm() {
    const isChecked = $("#chkAgree").is(":checked");
    const name = $("#inputLegalName").val().trim();
    
    // Minimum 3 chars for a legal name binding
    if (isChecked && name.length >= 3) {
        $("#btnConfirmSign").prop("disabled", false);
    } else {
        $("#btnConfirmSign").prop("disabled", true);
    }
}

function submitSignature(e) {
    e.preventDefault();
    if (!currentSigningId) return;

    const form = $("#signForm")[0];
    if (!form.checkValidity()) {
        e.stopPropagation();
        form.classList.add('was-validated');
        return;
    }

    const legalName = $("#inputLegalName").val().trim();
    const btn = $("#btnConfirmSign");

    btn.prop("disabled", true).html('<span class="spinner-border spinner-border-sm me-2"></span>Securing Signature...');

    axios.post(`/api/signature/${currentSigningId}/sign`, { legal_name: legalName })
        .then(() => {
            toastr.success("Document Legally Bound and Signed!");
            $("#signingRoomModal").modal("hide");
            
            loadPendingDocs();
            histPage = 0; 
            loadHistoryDocs();
        })
        .catch(err => {
            toastr.error(err.response?.data?.detail || "Cryptographic signing failed.");
            btn.prop("disabled", false).html('<i class="ri-pen-nib-fill me-2"></i>Apply Signature & Complete');
        });
}

function renderSmartPreview(url, container) {
    container.empty();
    const filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
    const ext = filename.split('.').pop().toLowerCase();
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (ext === 'pdf') {
        container.html(`<object data="${url}" type="application/pdf" class="preview-iframe" style="background:#2C3E50;"></object>`);
    } else if (['doc', 'docx'].includes(ext)) {
        if (isLocalhost) {
            container.html(`
                <div class="text-center text-white p-5">
                    <i class="ri-error-warning-line fs-1 mb-3 text-warning"></i>
                    <h5 class="fw-bold">Security Block (Localhost)</h5>
                    <p>Word document previews are disabled on local testing servers.</p>
                    <a href="${url}" target="_blank" class="btn btn-light btn-sm mt-3 px-4 rounded-pill fw-bold text-dark">Download Secure File</a>
                </div>
            `);
        } else {
            const vUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
            container.html(`<iframe src="${vUrl}" class="preview-iframe" style="background:white;"></iframe>`);
        }
    } else {
        container.html(`<img src="${url}" class="preview-iframe" style="object-fit:contain; background:#111827; padding:20px;">`);
    }
}