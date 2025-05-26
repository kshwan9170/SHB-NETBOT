import os
import sqlite3
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
        
        # 실시간 문의 통계 테이블
        db.execute('''
        CREATE TABLE IF NOT EXISTS query_statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_text TEXT NOT NULL,
            category TEXT,
            count INTEGER DEFAULT 1,
            first_asked DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_asked DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # 인덱스 생성
        db.execute('CREATE INDEX IF NOT EXISTS idx_query_count ON query_statistics(count DESC)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_query_category ON query_statistics(category)')
        
        # 데이터 마이그레이션 버전 확인
        migration_version = db.execute('PRAGMA user_version').fetchone()[0]
        
        # 버전 0이면 chat_feedback에서 query_statistics로 데이터 마이그레이션
        if migration_version == 0:
            # chat_feedback에 데이터가 있는지 확인
            has_feedback = db.execute('SELECT COUNT(*) FROM chat_feedback').fetchone()[0] > 0
            has_stats = db.execute('SELECT COUNT(*) FROM query_statistics').fetchone()[0] > 0
            
            if has_feedback and not has_stats:
                # 질문 목록을 그룹화하여 각 질문별 횟수 계산
                db.execute('''
                INSERT INTO query_statistics (query_text, count, first_asked, last_asked)
                SELECT question, COUNT(*) as cnt, MIN(created_at), MAX(created_at)
                FROM chat_feedback
                GROUP BY question
                ''')
                print(f"채팅 피드백에서 {db.execute('SELECT COUNT(*) FROM query_statistics').fetchone()[0]}개의 질문 통계를 마이그레이션했습니다.")
            
            # 마이그레이션 완료 표시
            db.execute('PRAGMA user_version = 1')
        
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


# 실시간 문의 통계 모델
class QueryStatisticsModel:
    def __init__(self):
        self.table_name = 'query_statistics'
    
    def extract_category_from_filename(self, query_text):
        """
        업무 안내 가이드 파일명에서 괄호 안 카테고리 추출
        
        Args:
            query_text: 사용자 질문
            
        Returns:
            추출된 카테고리 (IP_사용자_조회, 대외계_연동, 장애_문의, 절차_안내, 자산 등)
        """
        # 파일명 기반 카테고리 매핑
        category_keywords = {
            'IP_사용자_조회': ['ip', 'IP', '아이피', '사용자', '조회'],
            '대외계_연동': ['대외계', '연동', '기관', '외부', '시스템'],
            '장애_문의': ['장애', '오류', '에러', '문제', '안돼', '안됨', '불가'],
            '절차_안내': ['절차', '방법', '프로세스', '단계', '순서'],
            '자산': ['자산', '장비', '하드웨어', '서버']
        }
        
        query_lower = query_text.lower()
        
        for category, keywords in category_keywords.items():
            if any(keyword.lower() in query_lower for keyword in keywords):
                return category
        
        return '일반'
    
    def record_query(self, query_text, category=None):
        """
        질문 기록 및 통계 업데이트
        
        Args:
            query_text: 사용자 질문
            category: 질문 카테고리 (선택 사항)
            
        Returns:
            처리된 질문 ID
        """
        db = get_db()
        
        # 카테고리가 없으면 자동으로 추출
        if not category:
            category = self.extract_category_from_filename(query_text)
        
        # 동일한 질문이 있는지 확인
        existing = db.execute(
            f'SELECT id, count FROM {self.table_name} WHERE query_text = ?', 
            (query_text,)
        ).fetchone()
        
        if existing:
            # 기존 질문 카운트 증가 및 마지막 질문 시간 업데이트
            db.execute(
                f'''
                UPDATE {self.table_name} 
                SET count = count + 1, last_asked = CURRENT_TIMESTAMP, category = ?
                WHERE id = ?
                ''', 
                (category, existing['id'])
            )
            db.commit()
            return existing['id']
        else:
            # 새 질문 등록
            cursor = db.execute(
                f'''
                INSERT INTO {self.table_name} (query_text, category)
                VALUES (?, ?)
                ''', 
                (query_text, category)
            )
            db.commit()
            return cursor.lastrowid
    
    def get_top_queries(self, limit=10, period=None, category=None):
        """
        가장 많이 질문된 Top N 쿼리 조회
        
        Args:
            limit: 결과 제한 수
            period: 기간 제한 ('day', 'week', 'month', None=전체 기간)
            category: 카테고리 필터 (선택 사항)
            
        Returns:
            Top N 쿼리 목록
        """
        db = get_db()
        
        sql_conditions = []
        params = []
        
        if period:
            if period == 'day':
                sql_conditions.append('last_asked >= date("now", "-1 day")')
            elif period == 'week':
                sql_conditions.append('last_asked >= date("now", "-7 day")')
            elif period == 'month':
                sql_conditions.append('last_asked >= date("now", "-30 day")')
        
        if category:
            sql_conditions.append('category = ?')
            params.append(category)
        
        where_clause = f"WHERE {' AND '.join(sql_conditions)}" if sql_conditions else ""
        
        query = f'''
        SELECT id, query_text, category, count, first_asked, last_asked
        FROM {self.table_name}
        {where_clause}
        ORDER BY count DESC
        LIMIT ?
        '''
        
        params.append(limit)
        top_queries = db.execute(query, params).fetchall()
        
        return [dict(q) for q in top_queries]
    
    def get_total_query_count(self, period=None):
        """
        총 질문 횟수 조회 (count 합계)
        
        Args:
            period: 기간 제한 ('day', 'week', 'month', None=전체 기간)
            
        Returns:
            총 질문 횟수
        """
        db = get_db()
        
        sql_conditions = []
        
        if period:
            if period == 'day':
                sql_conditions.append('last_asked >= date("now", "-1 day")')
            elif period == 'week':
                sql_conditions.append('last_asked >= date("now", "-7 day")')
            elif period == 'month':
                sql_conditions.append('last_asked >= date("now", "-30 day")')
        
        where_clause = f"WHERE {' AND '.join(sql_conditions)}" if sql_conditions else ""
        
        query = f'''
        SELECT COALESCE(SUM(count), 0) as total_count
        FROM {self.table_name}
        {where_clause}
        '''
        
        result = db.execute(query).fetchone()
        return result['total_count'] if result else 0
    
    def get_category_stats(self):
        """
        카테고리별 질문 통계 조회
        
        Returns:
            카테고리별 질문 수 목록
        """
        db = get_db()
        query = f'''
        SELECT 
            COALESCE(category, '미분류') as category,
            COUNT(*) as query_count,
            SUM(count) as total_count
        FROM {self.table_name}
        GROUP BY category
        ORDER BY total_count DESC
        '''
        
        stats = db.execute(query).fetchall()
        return [dict(s) for s in stats]
    
    def get_period_comparison(self, period1='week', period2='month'):
        """
        다른 기간 간 질문 비교 통계
        
        Args:
            period1: 첫 번째 기간 ('day', 'week', 'month')
            period2: 두 번째 기간 ('day', 'week', 'month')
            
        Returns:
            기간별 비교 데이터
        """
        db = get_db()
        
        period_map = {
            'day': '-1 day',
            'week': '-7 day',
            'last_week': '-14 day',
            'month': '-30 day',
            'last_month': '-60 day'
        }
        
        period1_sql = period_map.get(period1, '-7 day')
        period2_sql = period_map.get(period2, '-30 day')
        
        query = f'''
        SELECT 
            SUM(CASE WHEN last_asked >= date("now", ?) THEN 1 ELSE 0 END) as period1_count,
            SUM(CASE WHEN last_asked >= date("now", ?) AND last_asked < date("now", ?) THEN 1 ELSE 0 END) as period2_count
        FROM {self.table_name}
        '''
        
        stats = db.execute(query, (period1_sql, period2_sql, period1_sql)).fetchone()
        
        return {
            'period1': period1,
            'period2': period2,
            'period1_count': stats[0],
            'period2_count': stats[1],
            'change_percentage': round((stats[0] - stats[1]) / max(stats[1], 1) * 100, 2)
        }