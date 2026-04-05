/* static/js/finance/finance_ledger.js */
const { createApp } = Vue;

createApp({
    data() {
        return {
            // General Data
            transactions: [],
            summary: { total_cash_in: 0, total_cash_out: 0, net_balance: 0 },
            filters: { start: '', end: '', type: '' },
            pagination: { page: 1, size: 50, total: 0 },
            expenseHeads: [],
            isSaving: false,
            
            // Payroll Specific Data
            salaries: [],
            staffList: [],
            
            // Modal Management
            modalInstance: null,
            modalType: 'cash_in',
            form: {
                id: null, amount: '', date: '', method: 'cash', headId: '', desc: ''
            },

            salaryModalInstance: null,
            salaryForm: {
                id: null, user_id: '', basic_salary: '', allowance: 0, 
                salary_month: '', note: '', direct_pay: false, payment_method: 'bank_transfer'
            },

            paySalaryModalInstance: null,
            payForm: { salary_id: null, payment_method: 'bank_transfer' }
        };
    },
    computed: {
        modalTitle() {
            return this.modalType === 'cash_in' ? 'Cash In' : 'Expense';
        },
        paginationStart() {
            return this.pagination.total === 0 ? 0 : ((this.pagination.page - 1) * this.pagination.size) + 1;
        },
        paginationEnd() {
            return Math.min(this.pagination.page * this.pagination.size, this.pagination.total);
        }
    },
    mounted() {
        // Set Default Dates (First day of month to today)
        const now = new Date();
        this.filters.start = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
        this.filters.end = now.toLocaleDateString('en-CA');
        this.form.date = this.filters.end;

        // Init Bootstrap Modals
        this.modalInstance = new bootstrap.Modal(document.getElementById('transactionModal'), { backdrop: 'static' });
        this.salaryModalInstance = new bootstrap.Modal(document.getElementById('salaryModal'), { backdrop: 'static' });
        this.paySalaryModalInstance = new bootstrap.Modal(document.getElementById('paySalaryModal'), { backdrop: 'static' });

        // Initial Data Load
        this.loadExpenseHeads();
        this.loadStaffList();
        this.loadAllData();
    },
    methods: {
        // --- Formatter Utilities ---
        formatCurrency(val) {
            return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 2 }).format(val || 0);
        },
        formatMethod(method) {
            if (!method) return '';
            return method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        },
        formatMonth(dateStr) {
            if (!dateStr) return '';
            return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        },
        isPayroll(txn) {
            return txn.expense_head && txn.expense_head.name.toLowerCase() === 'salary';
        },

        // --- Data Fetching ---
        async loadAllData() {
            if(typeof myshowLoader === 'function') myshowLoader();
            await Promise.all([this.loadSummary(), this.loadTransactions(), this.loadSalaries()]);
            if(typeof myhideLoader === 'function') myhideLoader();
        },
        async loadSummary() {
            try {
                const { start, end } = this.filters;
                const res = await axios.get(`/api/finance/reports/summary?start_date=${start}&end_date=${end}`);
                this.summary = res.data;
            } catch (err) { console.error('Failed to load KPI summary.'); }
        },
        async loadTransactions() {
            try {
                const { start, end, type } = this.filters;
                let url = `/api/finance/transactions?page=${this.pagination.page}&size=${this.pagination.size}&start_date=${start}&end_date=${end}`;
                if (type) url += `&type_filter=${type}`;
                const res = await axios.get(url);
                this.transactions = res.data.items;
                this.pagination.total = res.data.total;
            } catch (err) { showToastMessage('error', 'Error loading ledger data.'); }
        },
        async loadSalaries() {
            try {
                const res = await axios.get('/api/finance/salaries');
                this.salaries = res.data;
            } catch (err) { console.error('Error loading payroll data.'); }
        },
        async loadExpenseHeads() {
            try {
                const res = await axios.get('/api/finance/expense-heads?active_only=true');
                this.expenseHeads = res.data;
            } catch (err) { console.error("Failed to fetch expense heads"); }
        },
        async loadStaffList() {
            try {
                const res = await axios.get('/api/finance/staff');
                this.staffList = res.data;
            } catch (err) { console.error("Failed to fetch staff list"); }
        },

        // --- Ledger Interactions ---
        applyFilters() {
            this.pagination.page = 1;
            this.loadAllData();
        },
        changePage(delta) {
            this.pagination.page += delta;
            this.loadTransactions();
        },
        openModal(type, txn = null) {
            this.modalType = type;
            if (txn) {
                this.form.id = txn.id;
                this.form.amount = txn.amount;
                this.form.date = txn.transaction_date;
                this.form.method = txn.payment_method;
                this.form.desc = txn.description || '';
                this.form.headId = txn.expense_head_id || '';
            } else {
                this.form.id = null;
                this.form.amount = '';
                this.form.date = new Date().toLocaleDateString('en-CA');
                this.form.method = 'cash';
                this.form.desc = '';
                this.form.headId = '';
            }
            this.modalInstance.show();
        },

        // --- Payroll Interactions ---
        openSalaryModal(sal = null) {
            if (sal) {
                // Formatting date for <input type="month"> (YYYY-MM)
                let monthStr = sal.salary_month ? sal.salary_month.substring(0, 7) : '';
                this.salaryForm = {
                    id: sal.id, user_id: sal.user_id, basic_salary: sal.basic_salary, 
                    allowance: sal.allowance, salary_month: monthStr, note: sal.note || '',
                    direct_pay: false, payment_method: 'bank_transfer'
                };
            } else {
                let currentMonth = new Date().toISOString().substring(0, 7);
                this.salaryForm = {
                    id: null, user_id: '', basic_salary: '', allowance: 0, 
                    salary_month: currentMonth, note: '', direct_pay: false, payment_method: 'bank_transfer'
                };
            }
            this.salaryModalInstance.show();
        },
        openPayModal(sal) {
            this.payForm.salary_id = sal.id;
            this.payForm.payment_method = 'bank_transfer';
            this.paySalaryModalInstance.show();
        },

        // --- CRUD Operations (Ledger) ---
        async saveTransaction() {
            if (!this.form.date || !this.form.amount || this.form.amount <= 0) {
                return showToastMessage('warning', 'Please enter a valid date and positive amount.');
            }
            if (this.modalType === 'cash_out' && !this.form.headId) {
                return showToastMessage('warning', 'Please select an Expense Category.');
            }

            this.isSaving = true;
            const payload = {
                transaction_type: this.modalType,
                amount: parseFloat(this.form.amount),
                payment_method: this.form.method,
                transaction_date: this.form.date,
                description: this.form.desc || null,
                expense_head_id: this.modalType === 'cash_out' ? parseInt(this.form.headId) : null
            };

            try {
                if (this.form.id) {
                    await axios.put(`/api/finance/transactions/${this.form.id}`, payload);
                    showToastMessage('success', 'Transaction updated successfully.');
                } else {
                    await axios.post('/api/finance/transactions', payload);
                    showToastMessage('success', 'Transaction recorded successfully.');
                }
                this.modalInstance.hide();
                this.loadAllData(); // Refresh everything
            } catch (err) {
                const msg = err.response?.data?.detail || "Failed to save transaction.";
                showToastMessage('error', msg);
            } finally {
                this.isSaving = false;
            }
        },
        async deleteTransaction(id) {
            Swal.fire({
                title: 'Delete Transaction?',
                text: "This will permanently remove the record. If this was a payroll payout, the staff member's salary will be reverted to unpaid.",
                icon: 'warning',
                showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes, delete it!'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    if(typeof myshowLoader === 'function') myshowLoader();
                    try {
                        await axios.delete(`/api/finance/transactions/${id}`);
                        showToastMessage('success', 'Transaction deleted successfully.');
                        this.loadAllData();
                    } catch (err) {
                        showToastMessage('error', err.response?.data?.detail || "Could not delete.");
                    } finally {
                        if(typeof myhideLoader === 'function') myhideLoader();
                    }
                }
            });
        },

        // --- CRUD Operations (Payroll) ---
        async saveSalary() {
            // ==========================================
            // ROBUST FRONTEND VALIDATION ADDED HERE
            // ==========================================
            if (!this.salaryForm.id && !this.salaryForm.user_id) {
                return showToastMessage('warning', 'Please select a staff member.');
            }
            if (!this.salaryForm.salary_month) {
                return showToastMessage('warning', 'Please select a salary month.');
            }
            if (this.salaryForm.basic_salary === '' || parseFloat(this.salaryForm.basic_salary) <= 0) {
                return showToastMessage('warning', 'Please enter a valid basic salary amount.');
            }
            if (this.salaryForm.direct_pay && !this.salaryForm.payment_method) {
                return showToastMessage('warning', 'Please select a payment method for immediate payout.');
            }
            
            this.isSaving = true;
            
            // Append "-01" to match backend Date requirement
            const formattedMonth = `${this.salaryForm.salary_month}-01`;
            
            const payload = {
                user_id: parseInt(this.salaryForm.user_id),
                basic_salary: parseFloat(this.salaryForm.basic_salary),
                allowance: parseFloat(this.salaryForm.allowance || 0),
                note: this.salaryForm.note || null,
                salary_month: formattedMonth
            };

            try {
                if (this.salaryForm.id) {
                    // Update existing
                    await axios.put(`/api/finance/salaries/${this.salaryForm.id}`, payload);
                    showToastMessage('success', 'Salary record updated.');
                } else {
                    // Create new
                    if (this.salaryForm.direct_pay) {
                        payload.payment_method = this.salaryForm.payment_method;
                        await axios.post('/api/finance/salaries/direct-pay', payload);
                        showToastMessage('success', 'Salary assigned and paid successfully.');
                    } else {
                        await axios.post('/api/finance/salaries', payload);
                        showToastMessage('success', 'Salary assigned successfully.');
                    }
                }
                this.salaryModalInstance.hide();
                this.loadAllData(); // Refresh UI to sync ledger and KPIs
            } catch (err) {
                showToastMessage('error', err.response?.data?.detail || "Failed to save salary.");
            } finally {
                this.isSaving = false;
            }
        },
        
        async processSalaryPayment() {
            if (!this.payForm.salary_id) return;
            
            // Validate Payment Method
            if (!this.payForm.payment_method) {
                return showToastMessage('warning', 'Please select a payment method to process the payout.');
            }

            this.isSaving = true;

            const payload = {
                status: 'paid',
                payment_method: this.payForm.payment_method
            };

            try {
                await axios.patch(`/api/finance/salaries/${this.payForm.salary_id}/status`, payload);
                showToastMessage('success', 'Salary marked as paid and recorded in ledger.');
                this.paySalaryModalInstance.hide();
                this.loadAllData(); // Refresh Ledger, KPIs, and Payroll status
            } catch (err) {
                showToastMessage('error', err.response?.data?.detail || "Payment failed.");
            } finally {
                this.isSaving = false;
            }
        }
    }
}).mount('#financeLedgerApp');