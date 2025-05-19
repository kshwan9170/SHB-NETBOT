import os
import sqlite3
import json
from datetime import datetime
from flask import g

DATABASE = 'shinhan_netbot.db'

def get_db():
    """데이터베이스 연결 획득"""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row  # 결과를 딕셔너리로 반환
    return db

def close_db(exception):
    """애플리케이션 컨텍스트 종료 시 DB 연결 닫기"""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """데이터베이스 테이블 초기화"""
    with sqlite3.connect(DATABASE) as db:
        # 문의 게시판 테이블
        db.execute('''
        CREATE TABLE IF NOT EXISTS inquiry_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # 피드백 게시판 테이블
        db.execute('''
        CREATE TABLE IF NOT EXISTS feedback_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # 장애 신고 게시판 테이블
        db.execute('''
        CREATE TABLE IF NOT EXISTS report_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # 챗봇 응답 피드백 테이블
        db.execute('''
        CREATE TABLE IF NOT EXISTS chat_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            feedback_type TEXT NOT NULL,
            feedback_comment TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # FAQ 테이블 (Fine-tuning 기반 FAQ 목록)
        db.execute('''
        CREATE TABLE IF NOT EXISTS faq (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            category TEXT NOT NULL,
            is_published INTEGER NOT NULL DEFAULT 1,
            positive_count INTEGER NOT NULL DEFAULT 0,
            negative_count INTEGER NOT NULL DEFAULT 0,
            model_reflected INTEGER NOT NULL DEFAULT 0,
            last_updated TIMESTAMP NOT NULL
        )
        ''')
        
        db.commit()

# 게시판 기본 클래스
class BoardModel:
    def __init__(self, table_name):
        self.table_name = table_name
    
    def get_posts(self, page=1, per_page=10):
        """게시글 목록 조회"""
        db = get_db()
        offset = (page - 1) * per_page
        query = f'''
        SELECT id, title, content, author, created_at 
        FROM {self.table_name} 
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        '''
        posts = db.execute(query, (per_page, offset)).fetchall()
        
        # 전체 게시글 수
        count = db.execute(f'SELECT COUNT(*) FROM {self.table_name}').fetchone()[0]
        
        return {
            'posts': [dict(post) for post in posts],
            'total': count,
            'page': page,
            'per_page': per_page,
            'pages': (count + per_page - 1) // per_page
        }
    
    def get_post(self, post_id):
        """특정 게시글 조회"""
        db = get_db()
        query = f'''
        SELECT id, title, content, author, created_at 
        FROM {self.table_name} 
        WHERE id = ?
        '''
        post = db.execute(query, (post_id,)).fetchone()
        if post:
            # Convert row to dict and process timestamp
            post_dict = dict(post)
            # Convert timestamp string to datetime object if needed
            if isinstance(post_dict['created_at'], str):
                post_dict['created_at'] = datetime.strptime(post_dict['created_at'], '%Y-%m-%d %H:%M:%S')
            return post_dict
        return None
    
    def create_post(self, title, content, author):
        """게시글 생성"""
        db = get_db()
        query = f'''
        INSERT INTO {self.table_name} (title, content, author)
        VALUES (?, ?, ?)
        '''
        cursor = db.execute(query, (title, content, author))
        db.commit()
        return cursor.lastrowid
    
    def update_post(self, post_id, title, content, author):
        """게시글 수정"""
        db = get_db()
        query = f'''
        UPDATE {self.table_name}
        SET title = ?, content = ?, author = ?
        WHERE id = ?
        '''
        db.execute(query, (title, content, author, post_id))
        db.commit()
        return True
    
    def delete_post(self, post_id):
        """게시글 삭제"""
        db = get_db()
        query = f'''
        DELETE FROM {self.table_name}
        WHERE id = ?
        '''
        db.execute(query, (post_id,))
        db.commit()
        return True

# 각 게시판별 모델
class InquiryBoard(BoardModel):
    def __init__(self):
        super().__init__('inquiry_posts')

class FeedbackBoard(BoardModel):
    def __init__(self):
        super().__init__('feedback_posts')

class ReportBoard(BoardModel):
    def __init__(self):
        super().__init__('report_posts')
        
# FAQ 모델
class FAQModel:
    def __init__(self):
        self.table_name = 'faq'
    
    def get_all_faqs(self, page=1, per_page=20, admin_view=False):
        """
        FAQ 목록 조회
        
        Args:
            page: 페이지 번호
            per_page: 페이지당 항목 수
            admin_view: 관리자용 상세 정보 포함 여부
            
        Returns:
            FAQ 목록과 페이지 정보
        """
        db = get_db()
        cursor = db.cursor()
        
        # 전체 항목 수 조회
        cursor.execute(f"SELECT COUNT(*) FROM {self.table_name}")
        total_count = cursor.fetchone()[0]
        
        # 페이지 계산
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        offset = (page - 1) * per_page
        
        # 기본 필드
        fields = "id, question, answer, category, is_published"
        
        # 관리자 모드인 경우 추가 필드 포함
        if admin_view:
            fields += ", positive_count, negative_count, model_reflected, last_updated"
            
        # 데이터 조회
        query = f"""
            SELECT {fields}
            FROM {self.table_name}
            ORDER BY category, last_updated DESC
            LIMIT ? OFFSET ?
        """
        
        cursor.execute(query, (per_page, offset))
        faq_list = cursor.fetchall()
        
        # 결과 포맷팅
        results = []
        for item in faq_list:
            faq_item = {
                'id': item[0],
                'question': item[1],
                'answer': item[2],
                'category': item[3],
                'is_published': bool(item[4])
            }
            
            # 관리자 모드인 경우 추가 정보 포함
            if admin_view and len(item) > 5:
                faq_item.update({
                    'positive_count': item[5],
                    'negative_count': item[6],
                    'model_reflected': bool(item[7]),
                    'last_updated': item[8]
                })
                
            results.append(faq_item)
            
        return {
            'items': results,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
            'total_count': total_count
        }
    
    def get_faq_by_id(self, faq_id, admin_view=False):
        """
        특정 FAQ 조회
        
        Args:
            faq_id: FAQ ID
            admin_view: 관리자용 상세 정보 포함 여부
            
        Returns:
            FAQ 정보
        """
        db = get_db()
        cursor = db.cursor()
        
        # 기본 필드
        fields = "id, question, answer, category, is_published"
        
        # 관리자 모드인 경우 추가 필드 포함
        if admin_view:
            fields += ", positive_count, negative_count, model_reflected, last_updated"
            
        # 데이터 조회
        query = f"""
            SELECT {fields}
            FROM {self.table_name}
            WHERE id = ?
        """
        
        cursor.execute(query, (faq_id,))
        item = cursor.fetchone()
        
        if not item:
            return None
            
        # 결과 포맷팅
        faq_item = {
            'id': item[0],
            'question': item[1],
            'answer': item[2],
            'category': item[3],
            'is_published': bool(item[4])
        }
        
        # 관리자 모드인 경우 추가 정보 포함
        if admin_view and len(item) > 5:
            faq_item.update({
                'positive_count': item[5],
                'negative_count': item[6],
                'model_reflected': bool(item[7]),
                'last_updated': item[8]
            })
            
        return faq_item
    
    def create_faq(self, question, answer, category, is_published=True):
        """
        새 FAQ 생성
        
        Args:
            question: 질문
            answer: 답변
            category: 카테고리
            is_published: 공개 여부
            
        Returns:
            생성된 FAQ ID
        """
        db = get_db()
        cursor = db.cursor()
        
        query = f"""
            INSERT INTO {self.table_name} (
                question, answer, category, is_published,
                positive_count, negative_count, model_reflected, last_updated
            ) VALUES (?, ?, ?, ?, 0, 0, 0, ?)
        """
        
        cursor.execute(
            query, 
            (question, answer, category, int(is_published), datetime.now())
        )
        
        db.commit()
        return cursor.lastrowid
    
    def update_faq(self, faq_id, question=None, answer=None, category=None, is_published=None, model_reflected=None):
        """
        FAQ 업데이트
        
        Args:
            faq_id: FAQ ID
            question: 질문 (선택)
            answer: 답변 (선택)
            category: 카테고리 (선택)
            is_published: 공개 여부 (선택)
            model_reflected: 모델 반영 여부 (선택)
            
        Returns:
            업데이트 성공 여부
        """
        db = get_db()
        cursor = db.cursor()
        
        # 현재 데이터 조회
        cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (faq_id,))
        current_data = cursor.fetchone()
        
        if not current_data:
            return False
            
        # 업데이트할 필드와 값 준비
        update_fields = []
        update_values = []
        
        if question is not None:
            update_fields.append("question = ?")
            update_values.append(question)
            
        if answer is not None:
            update_fields.append("answer = ?")
            update_values.append(answer)
            
        if category is not None:
            update_fields.append("category = ?")
            update_values.append(category)
            
        if is_published is not None:
            update_fields.append("is_published = ?")
            update_values.append(int(is_published))
            
        if model_reflected is not None:
            update_fields.append("model_reflected = ?")
            update_values.append(int(model_reflected))
        
        # 마지막 업데이트 시간 추가
        update_fields.append("last_updated = ?")
        update_values.append(datetime.now())
        
        # 업데이트할 내용이 없으면 종료
        if not update_fields:
            return True
            
        # 업데이트 쿼리 구성
        query = f"""
            UPDATE {self.table_name}
            SET {', '.join(update_fields)}
            WHERE id = ?
        """
        
        update_values.append(faq_id)
        
        cursor.execute(query, update_values)
        db.commit()
        
        return cursor.rowcount > 0
        
    def delete_faq(self, faq_id):
        """
        FAQ 삭제
        
        Args:
            faq_id: FAQ ID
            
        Returns:
            삭제 성공 여부
        """
        db = get_db()
        cursor = db.cursor()
        
        query = f"DELETE FROM {self.table_name} WHERE id = ?"
        cursor.execute(query, (faq_id,))
        db.commit()
        
        return cursor.rowcount > 0
        
    def update_feedback(self, faq_id, is_positive):
        """
        FAQ 피드백 업데이트 (좋아요/싫어요)
        
        Args:
            faq_id: FAQ ID
            is_positive: 긍정적 피드백 여부
            
        Returns:
            업데이트 성공 여부
        """
        db = get_db()
        cursor = db.cursor()
        
        field = "positive_count" if is_positive else "negative_count"
        
        query = f"""
            UPDATE {self.table_name}
            SET {field} = {field} + 1
            WHERE id = ?
        """
        
        cursor.execute(query, (faq_id,))
        db.commit()
        
        return cursor.rowcount > 0
    
    def get_faq_categories(self):
        """
        FAQ 카테고리 목록 조회
        
        Returns:
            카테고리 목록
        """
        db = get_db()
        cursor = db.cursor()
        
        query = f"""
            SELECT DISTINCT category
            FROM {self.table_name}
            ORDER BY category
        """
        
        cursor.execute(query)
        categories = [row[0] for row in cursor.fetchall()]
        
        return categories
    
    def search_faqs(self, keyword, page=1, per_page=20, admin_view=False):
        """
        FAQ 검색
        
        Args:
            keyword: 검색어
            page: 페이지 번호
            per_page: 페이지당 항목 수
            admin_view: 관리자용 상세 정보 포함 여부
            
        Returns:
            검색 결과와 페이지 정보
        """
        db = get_db()
        cursor = db.cursor()
        
        # 검색어 처리
        search_term = f"%{keyword}%"
        
        # 공개된 FAQ만 검색하는 조건 (일반 사용자 모드)
        published_condition = "AND is_published = 1" if not admin_view else ""
        
        # 전체 검색 결과 수 조회
        count_query = f"""
            SELECT COUNT(*)
            FROM {self.table_name}
            WHERE (question LIKE ? OR answer LIKE ? OR category LIKE ?)
            {published_condition}
        """
        
        cursor.execute(count_query, (search_term, search_term, search_term))
        total_count = cursor.fetchone()[0]
        
        # 페이지 계산
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        offset = (page - 1) * per_page
        
        # 기본 필드
        fields = "id, question, answer, category, is_published"
        
        # 관리자 모드인 경우 추가 필드 포함
        if admin_view:
            fields += ", positive_count, negative_count, model_reflected, last_updated"
            
        # 데이터 조회
        search_query = f"""
            SELECT {fields}
            FROM {self.table_name}
            WHERE (question LIKE ? OR answer LIKE ? OR category LIKE ?)
            {published_condition}
            ORDER BY category, last_updated DESC
            LIMIT ? OFFSET ?
        """
        
        cursor.execute(search_query, (search_term, search_term, search_term, per_page, offset))
        search_results = cursor.fetchall()
        
        # 결과 포맷팅
        results = []
        for item in search_results:
            faq_item = {
                'id': item[0],
                'question': item[1],
                'answer': item[2],
                'category': item[3],
                'is_published': bool(item[4])
            }
            
            # 관리자 모드인 경우 추가 정보 포함
            if admin_view and len(item) > 5:
                faq_item.update({
                    'positive_count': item[5],
                    'negative_count': item[6],
                    'model_reflected': bool(item[7]),
                    'last_updated': item[8]
                })
                
            results.append(faq_item)
            
        return {
            'items': results,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
            'total_count': total_count,
            'keyword': keyword
        }
    
    def export_to_jsonl(self, include_unpublished=False, include_not_reflected=False):
        """
        FAQ 데이터를 JSONL 형식으로 내보내기 (Fine-tuning용)
        
        Args:
            include_unpublished: 비공개 FAQ 포함 여부
            include_not_reflected: 모델 미반영 FAQ 포함 여부
            
        Returns:
            JSONL 형식 문자열
        """
        db = get_db()
        cursor = db.cursor()
        
        # 조건 구성
        conditions = []
        
        if not include_unpublished:
            conditions.append("is_published = 1")
            
        if not include_not_reflected:
            conditions.append("model_reflected = 1")
            
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        # 데이터 조회
        query = f"""
            SELECT question, answer
            FROM {self.table_name}
            {where_clause}
            ORDER BY category, last_updated DESC
        """
        
        cursor.execute(query)
        faq_list = cursor.fetchall()
        
        # JSONL 형식으로 변환
        jsonl_lines = []
        for item in faq_list:
            # Fine-tuning용 포맷 (시스템 메시지, 사용자 메시지, 어시스턴트 응답)
            entry = {
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant for Shinhan Bank network support."},
                    {"role": "user", "content": item[0]},
                    {"role": "assistant", "content": item[1]}
                ]
            }
            jsonl_lines.append(json.dumps(entry, ensure_ascii=False))
            
        return "\n".join(jsonl_lines)

# 챗봇 피드백 모델
class ChatFeedbackModel:
    def __init__(self):
        self.table_name = 'chat_feedback'
    
    def create_feedback(self, question, answer, feedback_type, feedback_comment=None):
        """
        챗봇 응답에 대한 피드백 저장
        
        Args:
            question: 사용자 질문
            answer: 챗봇 응답
            feedback_type: 피드백 유형 (좋아요/싫어요)
            feedback_comment: 추가 코멘트 (선택 사항)
            
        Returns:
            생성된 피드백 ID
        """
        db = get_db()
        query = f'''
        INSERT INTO {self.table_name} (question, answer, feedback_type, feedback_comment)
        VALUES (?, ?, ?, ?)
        '''
        cursor = db.execute(query, (question, answer, feedback_type, feedback_comment))
        db.commit()
        return cursor.lastrowid
    
    def get_all_feedback(self, page=1, per_page=20):
        """
        모든 피드백 조회
        
        Args:
            page: 페이지 번호
            per_page: 페이지당 항목 수
            
        Returns:
            피드백 목록과 페이지 정보
        """
        db = get_db()
        offset = (page - 1) * per_page
        query = f'''
        SELECT id, question, answer, feedback_type, feedback_comment, created_at
        FROM {self.table_name}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        '''
        feedbacks = db.execute(query, (per_page, offset)).fetchall()
        
        # 전체 피드백 수
        count = db.execute(f'SELECT COUNT(*) FROM {self.table_name}').fetchone()[0]
        
        return {
            'feedbacks': [dict(feedback) for feedback in feedbacks],
            'total': count,
            'page': page,
            'per_page': per_page,
            'pages': (count + per_page - 1) // per_page
        }
    
    def get_feedback_stats(self):
        """
        피드백 통계 조회
        
        Returns:
            피드백 통계 정보
        """
        db = get_db()
        total = db.execute(f'SELECT COUNT(*) FROM {self.table_name}').fetchone()[0]
        positive = db.execute(f'SELECT COUNT(*) FROM {self.table_name} WHERE feedback_type = ?', ('👍 도움 됨',)).fetchone()[0]
        negative = db.execute(f'SELECT COUNT(*) FROM {self.table_name} WHERE feedback_type = ?', ('👎 부족함',)).fetchone()[0]
        
        return {
            'total': total,
            'positive': positive,
            'negative': negative,
            'positive_percentage': round(positive / total * 100, 2) if total > 0 else 0,
            'negative_percentage': round(negative / total * 100, 2) if total > 0 else 0
        }