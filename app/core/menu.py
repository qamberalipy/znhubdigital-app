# app/core/menu.py
MENU = {
    "admin": [
        {"label": "Dashboard", "icon": "ri-home-4-line", "path": "/dashboard", "children": []},
        {"label": "Users", "icon": "ri-user-line", "path": "/admin_users", "children": []},
        {"label": "View Leads", "icon": "ri-eye-line", "path": "/view-lead", "children": []},
        {"label": "Task Assigner", "icon": "ri-task-line", "path": "/task_assigner", "children": []},
        {"label": "Projects", "icon": "ri-folder-line", "path": "/projects", "children": []},
        {"label": "Signature Assigner", "icon": "ri-file-text-line", "path": "/signature_assigner", "children": []},
        {"label": "Announcements", "icon": "ri-discuss-line", "path": "/admin_feed", "children": []},
        {"label": "Finance Ledger", "icon": "ri-file-chart-line", "path": "/finance/ledger", "children": []},
        {"label": "Finance Report", "icon": "ri-bar-chart-line", "path": "/finance/report", "children": []},
    ],
    "lead_generator": [
        {"label": "Dashboard", "icon": "ri-home-4-line", "path": "/dashboard", "children": []},
        {"label": "View Leads", "icon": "ri-eye-line", "path": "/view-lead", "children": []},
        {"label": "Task Assigner", "icon": "ri-task-line", "path": "/task_assigner", "children": []},
        {"label": "Signature Assigner", "icon": "ri-file-text-line", "path": "/signature_assigner", "children": []},
        {"label": "Announcements", "icon": "ri-discuss-line", "path": "/admin_feed", "children": []},
    ],
    "sale": [
        {"label": "Dashboard", "icon": "ri-home-4-line", "path": "/dashboard", "children": []},
        {"label": "Task Assigner", "icon": "ri-task-line", "path": "/task_assigner", "children": []},
        {"label": "View Leads", "icon": "ri-eye-line", "path": "/view-lead", "children": []},
        {"label": "Signature Assigner", "icon": "ri-file-text-line", "path": "/signature_assigner", "children": []},
        {"label": "Announcements", "icon": "ri-discuss-line", "path": "/admin_feed", "children": []},
    ],
    "client": [
        {"label": "Dashboard", "icon": "ri-home-4-line", "path": "/dashboard", "children": []},
        {"label": "Task Submission", "icon": "ri-file-upload-line", "path": "/task_assigner", "children": []},
        {"label": "Signature Signer", "icon": "ri-file-text-line", "path": "/signature_signer", "children": []},
        {"label": "Announcements", "icon": "ri-discuss-line", "path": "/admin_feed", "children": []},
    ],
    "default": [
        {"label": "Dashboard", "icon": "ri-home-4-line", "path": "/dashboard", "children": []},
    ]
}
