/* static/js/finance/finance_report.js */
const { createApp } = Vue;

createApp({
    data() {
        return {
            selectedMonth: '',
            isLoading: false,
            reportData: null
        };
    },
    mounted() {
        // Default to current year and month
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        this.selectedMonth = `${year}-${month}`;
    },
    methods: {
        
        // --- 1. UPDATED CURRENCY TO USD ($) ---
        formatCurrency(val) {
            return new Intl.NumberFormat('en-US', { 
                style: 'currency', 
                currency: 'USD', 
                minimumFractionDigits: 0 
            }).format(val || 0);
        },
        
        sumData(arr) {
            return arr.reduce((sum, item) => sum + item.total_amount, 0);
        },
        
        async generateReport() {
            if (!this.selectedMonth) return showToastMessage('warning', 'Please select a month.');
            
            this.isLoading = true;
            try {
                const res = await axios.get(`/api/finance/reports/monthly-detailed?target_month=${this.selectedMonth}`);
                this.reportData = res.data;
            } catch (err) {
                const msg = err.response?.data?.detail || "Failed to load financial report.";
                showToastMessage('error', msg);
                this.reportData = null;
            } finally {
                this.isLoading = false;
            }
        },

        downloadPDF() {
            if (!window.jspdf) return showToastMessage('error', 'PDF module loading, please wait...');
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // --- Document Header ---
            doc.setFontSize(20);
            doc.setTextColor(17, 24, 39);
            doc.text("ZN Digital Hub", 105, 20, { align: "center" });
            
            doc.setFontSize(14);
            doc.setTextColor(75, 85, 99);
            doc.text("Monthly Financial Statement", 105, 28, { align: "center" });
            
            doc.setFontSize(11);
            doc.text(`Period: ${this.reportData.period}`, 105, 34, { align: "center" });

            // --- Summary Cards mapped to Text ---
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Total Income: ${this.formatCurrency(this.reportData.total_income)}`, 14, 50);
            doc.text(`Total Expense: ${this.formatCurrency(this.reportData.total_expense)}`, 14, 56);
            doc.setFont("helvetica", "bold");
            doc.text(`Net Profit: ${this.formatCurrency(this.reportData.net_profit)}`, 14, 62);
            doc.setFont("helvetica", "normal");

            // --- Tables Configuration ---
            const commonTableStyles = {
                theme: 'grid', styles: { fontSize: 9, cellPadding: 4 },
                headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
                margin: { left: 14, right: 14 }
            };

            let currentY = 75;

            // 1. Inflows
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("1. Cash Inflow Breakdown", 14, currentY);
            doc.autoTable({
                ...commonTableStyles,
                html: '#inflowTable',
                startY: currentY + 4,
            });

            // 2. Expenses 
            currentY = doc.lastAutoTable.finalY + 15;
            doc.setFontSize(11);
            doc.text("2. Operating Expenses by Category", 14, currentY);
            doc.autoTable({
                ...commonTableStyles,
                html: '#expenseTable',
                startY: currentY + 4,
            });

            // 3. Salaries
            currentY = doc.lastAutoTable.finalY + 15;
            if (currentY > 270) { doc.addPage(); currentY = 20; }

            doc.setFontSize(11);
            doc.text("3. Staff Payroll & Salaries", 14, currentY);
            doc.autoTable({
                ...commonTableStyles,
                html: '#payrollTable',
                startY: currentY + 4,
            });

            doc.save(`ZN_Hub_Financial_Report_${this.selectedMonth}.pdf`);
        },

        downloadExcel() {
            if (!window.XLSX) return showToastMessage('error', 'Excel module loading, please wait...');

            let sheetData = [
                ["ZN Digital Hub - Monthly Financial Statement"],
                ["Period:", this.reportData.period],
                ["Generated On:", new Date().toLocaleDateString()],
                [],
                ["--- EXECUTIVE SUMMARY ---"],
                ["Total Cash Inflow", this.reportData.total_income],
                ["Total Outflow", this.reportData.total_expense],
                ["Net Operational Profit", this.reportData.net_profit],
                [],
                ["--- 1. CASH INFLOW BREAKDOWN ---"],
                ["Payment Method", "Amount"]
            ];

            this.reportData.inflows_by_method.forEach(item => {
                sheetData.push([item.payment_method, item.total_amount]);
            });
            
            sheetData.push([]);
            sheetData.push(["--- 2. OPERATIONAL EXPENSES ---"]);
            sheetData.push(["Expense Category", "Amount"]);
            this.reportData.expenses_by_head.forEach(item => {
                sheetData.push([item.head_name, item.total_amount]);
            });

            sheetData.push([]);
            sheetData.push(["--- 3. STAFF PAYROLL ---"]);
            sheetData.push(["Employee Name", "Amount Paid"]);
            this.reportData.salaries_by_staff.forEach(item => {
                sheetData.push([item.staff_name, item.total_amount]);
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            ws['!cols'] = [{ wch: 35 }, { wch: 20 }];

            XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
            XLSX.writeFile(wb, `ZN_Hub_Financial_Report_${this.selectedMonth}.xlsx`);
        }
    }
}).mount('#financeReportApp');