# app/signature/models.py
from enum import Enum as _PyEnum
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
import app.core.db.session as _database

class SignatureStatus(str, _PyEnum):
    pending = "Pending"
    signed = "Signed"
    declined = "Declined"
    expired = "Expired"

class SignatureRequest(_database.Base):
    __tablename__ = "signature_request"

    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    requester_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    signer_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)

    title = _sql.Column(_sql.String(150), nullable=False) # e.g., "NDA Agreement", "Model Release"
    document_url = _sql.Column(_sql.String(500), nullable=False) # URL to the PDF/Doc
    description = _sql.Column(_sql.Text, nullable=True)
    
    status = _sql.Column(_sql.String, default=SignatureStatus.pending.value, nullable=False)
    deadline = _sql.Column(_sql.DateTime, nullable=True)

    signed_legal_name = _sql.Column(_sql.String(150), nullable=True) 
    
    signed_at = _sql.Column(_sql.DateTime, nullable=True)
    signer_ip_address = _sql.Column(_sql.String(45), nullable=True) 

    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())

    requester = relationship("User", foreign_keys=[requester_id], backref="signature_requests_sent")
    signer = relationship("User", foreign_keys=[signer_id], backref="signature_requests_received")
