from flask import Blueprint, render_template, redirect

pages_bp = Blueprint("pages", __name__)

# (template, page title, subtitle) for every page in the sidebar.
# Kept in one place so the title/subtitle text is easy to find and edit.
PAGES = {
    "dashboard": ("dashboard.html", "Dashboard", "Live tracking, billing &amp; consumption summary"),
    "calls":     ("calls.html", "Call Data / Service Tickets", "Log, track and bill every service call"),
    "purchases": ("purchases.html", "Purchase Ledger", "Stock received from suppliers"),
    "inventory": ("inventory.html", "Inventory (Consumption / Sales) Ledger", "Parts issued to technicians or sold"),
    "cashbook":  ("cashbook.html", "Daily Cash Book", "Income &amp; expenditure — receipts, payments and running balance"),
    "income-expenditure": ("income_expenditure.html", "Income &amp; Expenditure Statement", "Summary of approved Cash Book entries, by category — Admin only"),
    "reports":   ("reports.html", "Reports", "Export records for any date range"),
    "slakpi":    ("slakpi.html", "SLA &amp; KPI Report", "Technician turnaround, completion rate &amp; SLA compliance"),
    "settings":  ("settings.html", "Settings", "Manage the dropdown / validation lists"),
}


def _render_page(name):
    template, title, sub = PAGES[name]
    return render_template(template, page_title=title, page_sub=sub, active_page=name)


@pages_bp.get("/")
def root():
    return redirect("/dashboard")


@pages_bp.get("/login")
def login_page():
    return render_template("login.html")


@pages_bp.get("/dashboard")
def dashboard_page():
    return _render_page("dashboard")


@pages_bp.get("/calls")
def calls_page():
    return _render_page("calls")


@pages_bp.get("/purchases")
def purchases_page():
    return _render_page("purchases")


@pages_bp.get("/inventory")
def inventory_page():
    return _render_page("inventory")


@pages_bp.get("/cashbook")
def cashbook_page():
    return _render_page("cashbook")


@pages_bp.get("/income-expenditure")
def income_expenditure_page():
    return _render_page("income-expenditure")


@pages_bp.get("/reports")
def reports_page():
    return _render_page("reports")


@pages_bp.get("/slakpi")
def slakpi_page():
    return _render_page("slakpi")


@pages_bp.get("/settings")
def settings_page():
    return _render_page("settings")
