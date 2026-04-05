/* static/js/settings.js */
const { createApp } = Vue;

createApp({
    data() {
        return {
            currentUserId: null,
            currentTab: 'profile',
            
            // State Flags
            isSaving: false,
            isUploading: false,
            isLoadingData: false,
            
            // User Data
            user: {
                id: '', full_name: '', email: '', role: '', phone: '', 
                bio: '', dob: '', gender: '', timezone: 'UTC', profile_picture_url: ''
            },
            availableTimezones: [],
            
            // External Lib Instances
            iti: null,
            cropper: null,
            cropModalInstance: null,
            expenseModalInstance: null,

            // Tab Specific Data
            attendance: { start: '', end: '', records: [], totalHours: 0 },
            salaries: [],
            expenseHeads: [],
            passwords: { old: '', new: '', confirm: '' },
            expenseForm: { id: null, name: '', description: '', is_active: true }
        };
    },
    computed: {
        totalEarned() {
            return this.salaries.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.total_amount, 0);
        },
        totalPending() {
            return this.salaries.filter(s => s.status === 'unpaid').reduce((sum, s) => sum + s.total_amount, 0);
        }
    },
    mounted() {
        // Fetch User ID from meta tag
        const metaId = document.querySelector('meta[name="user-id"]');
        if (metaId && metaId.content) {
            this.currentUserId = metaId.content;
        } else {
            console.error("User ID not found in meta tag.");
        }

        // Init Timezones
        try {
            this.availableTimezones = Intl.supportedValuesOf('timeZone');
        } catch (error) {
            this.availableTimezones = ['Asia/Karachi', 'UTC'];
        }

        // Init Modals
        this.cropModalInstance = new bootstrap.Modal(document.getElementById('cropModal'));
        this.expenseModalInstance = new bootstrap.Modal(document.getElementById('expenseHeadModal'));
        
        // Listen to Crop Modal hidden event to destroy cropper cleanly
        document.getElementById('cropModal').addEventListener('hidden.bs.modal', () => {
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }
            this.$refs.fileInput.value = ''; // Reset input
        });

        // Load Default Tab Data
        this.loadProfile();
        this.setDefaultDates();
    },
    methods: {
        // --- 1. Navigation & Formatters ---
        switchTab(tab) {
            this.currentTab = tab;
            if (tab === 'attendance' && this.attendance.records.length === 0) this.fetchAttendance();
            if (tab === 'salary' && this.salaries.length === 0) this.fetchMySalaries();
            if (tab === 'expense-heads' && this.expenseHeads.length === 0) this.fetchExpenseHeads();
            
            // Re-bind phone input if switching back to profile
            if (tab === 'profile') {
                this.$nextTick(() => this.initPhoneInput());
            }
        },
        formatCurrency(val) {
            return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(val || 0);
        },
        formatMonth(dateStr) {
            if (!dateStr) return '';
            return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        },
        setDefaultDates() {
            const now = new Date();
            this.attendance.start = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
            this.attendance.end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
        },

        // --- 2. Profile Management ---
        initPhoneInput() {
            if (this.$refs.phoneInput && !this.iti) {
                this.iti = window.intlTelInput(this.$refs.phoneInput, {
                    utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
                    separateDialCode: true,
                    preferredCountries: ["pk", "us", "gb"], 
                });
                if (this.user.phone) this.iti.setNumber(this.user.phone);
            }
        },
        async loadProfile() {
            if (!this.currentUserId) return;
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                const res = await axios.get(`/api/users/${this.currentUserId}`);
                this.user = { ...res.data };
                if (!this.user.timezone) this.user.timezone = 'UTC';
                
                // Initialize intlTelInput immediately after mounting
                this.$nextTick(() => { this.initPhoneInput(); });
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to load profile.');
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        },
        async saveProfile() {
            this.isSaving = true;
            if (typeof myshowLoader === 'function') myshowLoader();
            
            // Grab number from the plugin
            if (this.iti) this.user.phone = this.iti.getNumber();

            const payload = {
                full_name: this.user.full_name,
                bio: this.user.bio,
                phone: this.user.phone,
                dob: this.user.dob || null,
                gender: this.user.gender || null,
                timezone: this.user.timezone, 
                profile_picture_url: this.user.profile_picture_url
            };

            try {
                await axios.put(`/api/users/${this.currentUserId}`, payload);
                if (typeof showToastMessage === 'function') showToastMessage('success', 'Profile updated successfully!');
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to save changes.');
            } finally {
                this.isSaving = false;
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        },

        // --- 3. Image Upload & Crop ---
        triggerUpload() {
            this.$refs.fileInput.click();
        },
        onFileChange(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    this.$refs.cropImageEl.src = evt.target.result;
                    this.cropModalInstance.show();
                    
                    // Init cropper once modal is open
                    document.getElementById('cropModal').addEventListener('shown.bs.modal', () => {
                        if (!this.cropper) {
                            this.cropper = new Cropper(this.$refs.cropImageEl, { aspectRatio: 1, viewMode: 1, autoCropArea: 0.8 });
                        }
                    }, { once: true });
                };
                reader.readAsDataURL(file);
            }
        },
        cropAndUpload() {
            if (!this.cropper) return;
            const canvas = this.cropper.getCroppedCanvas({ width: 400, height: 400 });
            if (!canvas) { 
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Could not crop image.'); return; 
            }

            this.isUploading = true;
            canvas.toBlob(async (blob) => {
                this.cropModalInstance.hide();
                const formData = new FormData();
                formData.append('file', blob, 'profile-cropped.png'); 

                try {
                    const res = await axios.post('/api/upload/general-upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (res.data.status === 'success') {
                        this.user.profile_picture_url = res.data.url;
                        // Attempt to update nav avatar if present
                        const navAvatar = document.getElementById('user-avatar-display');
                        if (navAvatar) navAvatar.src = res.data.url;
                        if (typeof showToastMessage === 'function') showToastMessage('success', 'Photo uploaded! Click Save to confirm.');
                    }
                } catch (err) {
                    let msg = err.response?.data?.detail || "Upload failed.";
                    if(err.response?.status === 413) msg = "File too large.";
                    if (typeof showToastMessage === 'function') showToastMessage('error', msg);
                } finally {
                    this.isUploading = false;
                }
            }, 'image/png');
        },

        // --- 4. Password Management ---
        async savePassword() {
            if (!this.passwords.old || !this.passwords.new || !this.passwords.confirm) {
                if (typeof showToastMessage === 'function') showToastMessage('warning', 'Please fill in all password fields.'); return;
            }
            if (this.passwords.new !== this.passwords.confirm) {
                if (typeof showToastMessage === 'function') showToastMessage('error', 'New passwords do not match.'); return;
            }

            const payload = { old_password: this.passwords.old, new_password: this.passwords.new, confirm_password: this.passwords.confirm };
            this.isSaving = true;
            try {
                await axios.post('/api/users/change-password', payload);
                this.passwords = { old: '', new: '', confirm: '' };
                Swal.fire({
                    icon: 'success', title: 'Password Changed', text: 'Please log in again.', confirmButtonColor: '#2563EB' 
                }).then(() => { if (typeof handleLogout === 'function') handleLogout(); });
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', err.response?.data?.detail || "Password change failed.");
            } finally {
                this.isSaving = false;
            }
        },

        // --- 5. Salary Management (NEW) ---
        async fetchMySalaries() {
            this.isLoadingData = true;
            try {
                const res = await axios.get('/api/finance/my-salary');
                this.salaries = res.data;
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to fetch salary records.');
            } finally {
                this.isLoadingData = false;
            }
        },

        // --- 6. Attendance Management ---
        async fetchAttendance() {
            if (!this.currentUserId) return;
            this.isLoadingData = true;
            try {
                const res = await axios.get(`/api/users/${this.currentUserId}/attendance?start_date=${this.attendance.start}&end_date=${this.attendance.end}`);
                this.attendance.records = res.data.records;
                this.attendance.totalHours = res.data.cumulative_hours;
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to fetch attendance records.');
            } finally {
                this.isLoadingData = false;
            }
        },
        formatShiftDate(dateStr) {
            const dateParts = dateStr.split('-');
            const d = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
            return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d);
        },
        formatTime(dateStr, isEnd = false) {
            if (!dateStr) return isEnd ? `<span class="text-warning fw-semibold"><i class="ri-loader-4-line ri-spin me-1"></i>Active Shift</span>` : '-';
            const userTz = this.user.timezone || 'UTC';
            const d = new Date(dateStr);
            const tForm = new Intl.DateTimeFormat('en-US', { timeZone: userTz, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
            const dForm = new Intl.DateTimeFormat('en-US', { timeZone: userTz, month: 'short', day: 'numeric', year: 'numeric' }).format(d);
            return `${tForm} <span class="text-muted ms-1" style="font-size: 0.75rem;">(${dForm})</span>`;
        },
        exportAttendancePDF() {
            if (typeof window.jspdf === 'undefined') { if (typeof showToastMessage === 'function') showToastMessage('error', 'PDF library loading...'); return; }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const userName = this.user.full_name || this.user.email || 'My';
            
            doc.setFontSize(16); doc.setTextColor(11, 17, 32); doc.text(`${userName} - Attendance Report`, 14, 20);
            doc.setFontSize(10); doc.setTextColor(100, 116, 139); 
            doc.text(`Date Range: ${this.attendance.start} to ${this.attendance.end}`, 14, 28);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 33);
            
            doc.autoTable({
                html: '#myAttendanceTable', startY: 40, theme: 'grid',
                styles: { fontSize: 9, cellPadding: 4, textColor: [55, 65, 81] },
                headStyles: { fillColor: [243, 244, 246], textColor: [75, 85, 99], fontStyle: 'bold', halign: 'left' },
                footStyles: { fillColor: [243, 244, 246], textColor: [11, 17, 32], fontStyle: 'bold' }
            });
            doc.save(`${userName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.pdf`);
        },
        exportAttendanceExcel() {
            if (typeof XLSX === 'undefined') { if (typeof showToastMessage === 'function') showToastMessage('error', 'Excel library loading...'); return; }
            const userName = this.user.full_name || this.user.email || 'My';
            let table = document.getElementById("myAttendanceTable");
            let wb = XLSX.utils.table_to_book(table, { sheet: "Attendance Data" });
            XLSX.writeFile(wb, `${userName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.xlsx`);
        },

        // --- 7. Expense Heads (Admin Only) ---
        async fetchExpenseHeads() {
            this.isLoadingData = true;
            try {
                const res = await axios.get('/api/finance/expense-heads');
                this.expenseHeads = res.data;
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Error loading categories.');
            } finally {
                this.isLoadingData = false;
            }
        },
        openExpenseModal(item = null) {
            if (item) {
                this.expenseForm = { id: item.id, name: item.name, description: item.description, is_active: item.is_active };
            } else {
                this.expenseForm = { id: null, name: '', description: '', is_active: true };
            }
            this.expenseModalInstance.show();
        },
        async saveExpenseHead() {
            if (!this.expenseForm.name.trim()) {
                if (typeof showToastMessage === 'function') showToastMessage('warning', 'Category Name is required.'); return;
            }
            this.isSaving = true;
            try {
                if (this.expenseForm.id) {
                    await axios.put(`/api/finance/expense-heads/${this.expenseForm.id}`, this.expenseForm);
                    if (typeof showToastMessage === 'function') showToastMessage('success', 'Category updated successfully.');
                } else {
                    await axios.post('/api/finance/expense-heads', this.expenseForm);
                    if (typeof showToastMessage === 'function') showToastMessage('success', 'New category created.');
                }
                this.expenseModalInstance.hide();
                this.fetchExpenseHeads();
            } catch (err) {
                if (typeof showToastMessage === 'function') showToastMessage('error', err.response?.data?.detail || "Failed to save Category.");
            } finally {
                this.isSaving = false;
            }
        },
        deleteExpenseHead(id) {
            Swal.fire({
                title: 'Delete Category?',
                text: "You won't be able to revert this! If this head is connected to existing transactions, it might cause an error.",
                icon: 'warning',
                showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes, delete it!'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        await axios.delete(`/api/finance/expense-heads/${id}`);
                        if (typeof showToastMessage === 'function') showToastMessage('success', 'Category deleted.');
                        this.fetchExpenseHeads();
                    } catch (err) {
                        if (typeof showToastMessage === 'function') showToastMessage('error', err.response?.data?.detail || "Cannot delete category because it is in use.");
                    }
                }
            });
        }
    }
}).mount('#settingsApp');