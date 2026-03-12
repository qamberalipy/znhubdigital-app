# app/invoice/models.py
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import app.core.db.session as _database
from app.user.models import User

class ModelInvoice(_database.Base):
    __tablename__ = "model_invoice"

    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    
    # The Date for which these earnings are recorded
    invoice_date = _sql.Column(_sql.Date, nullable=False, index=True)

    # Revenue Headers
    subscription = _sql.Column(_sql.Float, default=0.0)
    tips = _sql.Column(_sql.Float, default=0.0)
    posts = _sql.Column(_sql.Float, default=0.0)
    messages = _sql.Column(_sql.Float, default=0.0)
    referrals = _sql.Column(_sql.Float, default=0.0)
    streams = _sql.Column(_sql.Float, default=0.0)
    others = _sql.Column(_sql.Float, default=0.0)

    # Timestamps
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=func.now())

    # Relationship
    user = relationship("User", backref="invoices")

    @property
    def total_earnings(self):
        return (
            (self.subscription or 0) +
            (self.tips or 0) +
            (self.posts or 0) +
            (self.messages or 0) +
            (self.referrals or 0) +
            (self.streams or 0) +
            (self.others or 0)
        )