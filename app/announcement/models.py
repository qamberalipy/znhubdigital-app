# app/announcement/models.py
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import app.core.db.session as _database
from app.user.models import User

class Announcement(_database.Base):
    __tablename__ = "announcement"

    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    author_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    
    # Content
    content = _sql.Column(_sql.Text, nullable=True)
    
    # URL Preview Metadata
    link_url = _sql.Column(_sql.String(500), nullable=True)
    link_title = _sql.Column(_sql.String(255), nullable=True)
    link_description = _sql.Column(_sql.Text, nullable=True)
    link_image = _sql.Column(_sql.String(500), nullable=True)
    
    # Timestamps
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=func.now())

    # Relationships
    author = relationship("User", backref="announcements", lazy="joined") # 'joined' loads author automatically
    attachments = relationship("AnnouncementAttachment", back_populates="announcement", cascade="all, delete-orphan")
    reactions = relationship("AnnouncementReaction", back_populates="announcement", cascade="all, delete-orphan")
    views = relationship("AnnouncementView", back_populates="announcement", cascade="all, delete-orphan")

    @property
    def view_count(self):
        return len(self.views)

class AnnouncementAttachment(_database.Base):
    __tablename__ = "announcement_attachment"

    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    announcement_id = _sql.Column(_sql.Integer, _sql.ForeignKey("announcement.id"), nullable=False)
    
    file_url = _sql.Column(_sql.String(500), nullable=False)
    file_type = _sql.Column(_sql.String(50), nullable=False)
    mime_type = _sql.Column(_sql.String(100), nullable=True)
    file_size_mb = _sql.Column(_sql.Float, nullable=True)
    thumbnail_url = _sql.Column(_sql.String(500), nullable=True)
    
    announcement = relationship("Announcement", back_populates="attachments")

class AnnouncementReaction(_database.Base):
    __tablename__ = "announcement_reaction"

    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    announcement_id = _sql.Column(_sql.Integer, _sql.ForeignKey("announcement.id"), nullable=False)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    emoji = _sql.Column(_sql.String(10), nullable=False)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now())

    announcement = relationship("Announcement", back_populates="reactions")
    user = relationship("User")

# --- NEW: View Tracking Model ---
class AnnouncementView(_database.Base):
    __tablename__ = "announcement_view"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    announcement_id = _sql.Column(_sql.Integer, _sql.ForeignKey("announcement.id"), nullable=False)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    viewed_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now())

    announcement = relationship("Announcement", back_populates="views")
    user = relationship("User")