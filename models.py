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