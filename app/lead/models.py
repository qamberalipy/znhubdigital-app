from enum import Enum as _PyEnum
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
import app.core.db.session as _database

class LeadSource(str, _PyEnum):
    facebook = "Facebook"
    linkedin = "LinkedIn"
    bark = "Bark"
    upwork = "Upwork"
    threads = "Threads"
    website = "Website"
    referral = "Referral"
    other = "Other"

class LeadType(str, _PyEnum):
    website = "Website"
    logo_design = "Logo Design"
    graphic_design = "Graphic Design"
    app_development = "App Development"
    crm_development = "CRM Development"
    go_high_level = "Go High Level"
    squarespace = "Squarespace"
    wix = "Wix"
    shopify = "Shopify"
    seo = "SEO"
    smm = "SMM"
    web_app = "Web App"
    marketing = "Marketing"
    digital_marketing = "Digital Marketing"
    other = "Other"

class LeadStatus(str, _PyEnum):
    new = "New"
    contacted = "Contacted"
    no_response = "No Response"
    wrong_number = "Wrong Number"

class Lead(_database.Base):
    __tablename__ = "lead"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    name = _sql.Column(_sql.String(150), nullable=False)
    phone_number = _sql.Column(_sql.String(50), nullable=True)
    email = _sql.Column(_sql.String(150), nullable=True)
    
    lead_source = _sql.Column(_sql.String, nullable=False, default=LeadSource.other.value)
    lead_type = _sql.Column(_sql.String, nullable=False, default=LeadType.other.value)
    status = _sql.Column(_sql.String, nullable=False, default=LeadStatus.new.value)
    
    description = _sql.Column(_sql.Text, nullable=True)
    comment = _sql.Column(_sql.Text, nullable=True)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())
    
    created_by_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=True)
    created_by = relationship("User", foreign_keys=[created_by_id])