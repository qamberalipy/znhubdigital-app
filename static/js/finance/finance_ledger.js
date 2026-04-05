/* static/js/finance/finance_ledger.js */
const { createApp } = Vue;

createApp({
    data() {
        return {
            transactions: [],
            summary: { total_cash_in: 0, total_cash_out: 0, net_balance: 0 },
            filters: { start: '', end: '', type: '' },
            pagination: { page: 1, size: 50, total: 0 },
            expenseHeads: [],
            
            // Modal Management
            modalInstance: null,
            modalType: 'cash_in',
            isSaving: false,
            form: {
                id: null,
                amount: '',
                date: '',
                method: 'cash',
                headId: '',
                desc: ''
            }
        };
    },
    computed: {
        modalTitle() {
            return this.modalType === 'cash_in' ? 'Cash In' : 'Expense / Payroll';
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

        // Init Bootstrap Modal
        this.modalInstance = new bootstrap.Modal(document.getElementById('transactionModal'), { backdrop: 'static' });

        this.loadExpenseHeads();
        this.loadDashboardData();
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
        isPayroll(txn) {
            return txn.expense_head && txn.expense_head.name.toLowerCase() === 'salary';
        },

        // --- Data Fetching ---
        async loadDashboardData() {
            myshowLoader();
            await Promise.all([this.loadSummary(), this.loadTransactions()]);
            myhideLoader();
        },
        async loadSummary() {
            try {
                const { start, end } = this.filters;
                const res = await axios.get(`/api/finance/reports/summary?start_date=${start}&end_date=${end}`);
                this.summary = res.data;
            } catch (err) {
                showToastMessage('error', 'Failed to load KPI summary.');
            }
        },
        async loadTransactions() {
            try {
                const { start, end, type } = this.filters;
                let url = `/api/finance/transactions?page=${this.pagination.page}&size=${this.pagination.size}&start_date=${start}&end_date=${end}`;
                if (type) url += `&type_filter=${type}`;

                const res = await axios.get(url);
                this.transactions = res.data.items;
                this.pagination.total = res.data.total;
            } catch (err) {
                showToastMessage('error', 'Error loading ledger data.');
            }
        },
        async loadExpenseHeads() {
            try {
                const res = await axios.get('/api/finance/expense-heads?active_only=true');
                this.expenseHeads = res.data;
            } catch (err) {
                console.error("Failed to fetch expense heads");
            }
        },

        // --- Interactions ---
        applyFilters() {
            this.pagination.page = 1;
            this.loadDashboardData();
        },
        changePage(delta) {
            this.pagination.page += delta;
            this.loadDashboardData();
        },
        openModal(type, txn = null) {
            this.modalType = type;
            
            if (txn) {
                // Populate for Edit Mode
                this.form.id = txn.id;
                this.form.amount = txn.amount;
                this.form.date = txn.transaction_date;
                this.form.method = txn.payment_method;
                this.form.desc = txn.description || '';
                this.form.headId = txn.expense_head_id || '';
            } else {
                // Reset for Create Mode
                this.form.id = null;
                this.form.amount = '';
                this.form.date = new Date().toLocaleDateString('en-CA');
                this.form.method = 'cash';
                this.form.desc = '';
                this.form.headId = '';
            }
            this.modalInstance.show();
        },

        // --- CRUD Operations ---
        async saveTransaction() {
            // Validation
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
                this.applyFilters(); // Refresh UI
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
                text: "This will permanently remove the record. If this was a salary payout, the staff member's salary will be reverted to unpaid.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Yes, delete it!'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    myshowLoader();
                    try {
                        await axios.delete(`/api/finance/transactions/${id}`);
                        showToastMessage('success', 'Transaction deleted successfully.');
                        this.applyFilters();
                    } catch (err) {
                        const msg = err.response?.data?.detail || "Could not delete transaction.";
                        showToastMessage('error', msg);
                    } finally {
                        myhideLoader();
                    }
                }
            });
        }
    }
}).mount('#financeLedgerApp');