"""backend/models.py — 所有 Pydantic request/response models"""
from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    user_id: str
    password: str
    bed: Optional[str] = None


class RegisterRequest(BaseModel):
    name: str
    account: str
    password: str
    phone: str
    role: str = "patient"
    regBed: Optional[str] = None
    regDept: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    account: str
    method: str = "sms"   # "sms" | "email"
    role: str = "patient"


class ResetPasswordRequest(BaseModel):
    account: str
    new_password: str
    otp: str
    role: str = "patient"


class PatientMessage(BaseModel):
    patient_id: str
    bed: str
    emotion: str
    text: Optional[str] = ""
    doctor_id: Optional[str] = None
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None
    ttas_level: Optional[int] = 3
    ttas_category: Optional[str] = "常規護理"
    ttas_summary: Optional[str] = ""
    nrs_estimated: Optional[int] = None
    bsrs_estimated: Optional[int] = None
    pcs_level: Optional[int] = None
    urgency_flags: Optional[list] = []
    self_harm_detected: Optional[bool] = False
    ttas_reasoning: Optional[str] = ""
    route: Optional[str] = ""


class TriageRequest(BaseModel):
    text: str
    patient_id: Optional[str] = ""
    patient_name: Optional[str] = "病患"


class NurseSeenRequest(BaseModel):
    message_id: int
    nurse_id: str


class DoctorReply(BaseModel):
    message_id: int
    reply_text: str
    reply_eta: str = ""


class EtaNoticeRequest(BaseModel):
    bed: str
    eta: str
    doctor_id: str = ""


class StarToggleRequest(BaseModel):
    star_color: str


class PrescriptionRequest(BaseModel):
    bed: str
    patient_name: str
    visual_type: str
    location_hint: str
    doctor_note: str
    doctor_id: Optional[str] = None


class PrescriptionReviewRequest(BaseModel):
    task_id: str
    action: str   # "approve" | "reject"
    doctor_id: str = "doctor_001"
    reject_reason: str = ""


class YoutubeSubmitRequest(BaseModel):
    task_id: str
    youtube_url: str
    user_id: str = "crowd_001"


class SpotRequest(BaseModel):
    location: str
    description: str
    special_requirements: Optional[str] = ""
    requested_by: str
    lat: Optional[float] = None
    lng: Optional[float] = None


class PointsRequest(BaseModel):
    points: int
    reason: str = ""


class FinalizePointsRequest(BaseModel):
    user_id: str
    score_pct: int


class AIReplyRequest(BaseModel):
    message_id: int
    patient_name: str = ""
    patient_emotion: str = ""
    patient_text: str = ""
    doctor_type: str = "resident"


class EmotionAlertIn(BaseModel):
    patient_id: str
    bed: str
    hospital: str = ""
    emotion: str
    emotion_label: str
    confidence: float
    doctor_id: str = ""


class LLMRecommendDeptRequest(BaseModel):
    raw_text: str


class LLMRewriteRequest(BaseModel):
    raw_text: str


class EmpathyRewriteRequest(BaseModel):
    raw_text: str
    patient_emotion: Optional[str] = ""
    history: Optional[list] = []


class VideoDescribeRequest(BaseModel):
    location_name: str = ""
    context: str = ""
    image_base64: str = ""
