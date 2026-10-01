from pathlib import Path
import json
import uuid
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import MySQLdb
import MySQLdb.cursors
from pypdf import PdfReader
import os
import traceback


import llm_client
import vector_store


load_dotenv()

os.environ["HTTP_PROXY"] = "http://127.0.0.1:3128"
os.environ["HTTPS_PROXY"] = "http://127.0.0.1:3128"



BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = (BASE_DIR.parent / 'code' / 'code').resolve()
FRONTEND_DIST_DIR = (FRONTEND_DIR / 'dist').resolve()
UPLOAD_DIR = BASE_DIR / 'uploads'
MAX_PDF_BYTES = 20 * 1024 * 1024

if not FRONTEND_DIR.exists():
    raise FileNotFoundError(f'Missing frontend directory: {FRONTEND_DIR}')

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(
    __name__,
    root_path=str(BASE_DIR),
)
CORS(app, resources={r'/api/*': {'origins': '*'}})
app.config['MAX_CONTENT_LENGTH'] = MAX_PDF_BYTES


@app.errorhandler(413)
def handle_file_too_large(_exc):
    return jsonify({'error': 'file exceeds the 20MB limit'}), 413


def get_db_connection():
    return MySQLdb.connect(
        host='sgpvm043.apac.bosch.com',
        user='aura_user',
        password='Aur@Pwd123',
        database='aura_dev',
        autocommit=False,
    )


def ensure_course_drafts_table(cursor):
    cursor.execute(
        '''
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE table_schema = 'aura_dev'
        AND table_name = 'course'
        '''
    )


def ensure_course_table(cursor):
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS course (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            audience VARCHAR(255) DEFAULT '',
            cover_image VARCHAR(500) DEFAULT '',
            modules_json LONGTEXT,
            images_json LONGTEXT,
            course_json LONGTEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        '''
    )

    # Add the full generated-course JSON column to an existing course table.
    try:
        cursor.execute(
            "ALTER TABLE course ADD COLUMN course_json LONGTEXT NULL"
        )
    except MySQLdb.OperationalError as exc:
        # MySQL duplicate-column error means the column already exists.
        if not exc.args or exc.args[0] != 1060:
            raise



def ensure_pdf_documents_table(cursor):
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS pdf_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            content_type VARCHAR(100),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )


def ensure_summary_table(cursor):
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS summary (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pdf_title VARCHAR(255) NOT NULL,
            pdf_path VARCHAR(500) NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    cursor.execute(
        '''
        SELECT COUNT(*) AS column_exists
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 'summary'
        AND column_name = 'session_id'
        '''
    )
    result = cursor.fetchone()
    if result and result['column_exists'] > 0:
        cursor.execute('ALTER TABLE summary DROP COLUMN session_id')


def ensure_chat_messages_table(cursor):
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            role VARCHAR(16) NOT NULL,
            content LONGTEXT NOT NULL,
            document_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )


def _fetch_recent_chat_history(cursor, session_id, limit=10):
    cursor.execute(
        '''
        SELECT role, content FROM chat_messages
        WHERE session_id = %s
        ORDER BY id DESC
        LIMIT %s
        ''',
        (session_id, limit),
    )
    rows = cursor.fetchall()
    return [{'role': row['role'], 'content': row['content']} for row in reversed(rows)]


def _log_chat_message(cursor, session_id, role, content, document_id=None):
    cursor.execute(
        'INSERT INTO chat_messages (session_id, role, content, document_id) VALUES (%s, %s, %s, %s)',
        (session_id, role, content, document_id),
    )


@app.route('/ui/<path:asset_path>')
def ui_asset(asset_path):
    return send_from_directory(str(FRONTEND_DIR), asset_path)

@app.route('/api/users', methods=['GET'])
def list_users():
    db = get_db_connection()
    cursor = db.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute('SELECT username, username AS name, email, role, status FROM admin ORDER BY username')
        rows = cursor.fetchall()
        return jsonify(rows)
    except MySQLdb.Error as exc:
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()


@app.route('/api/users', methods=['POST'])
def add_user():
    payload = request.get_json(silent=True) or request.form

    name = (payload.get('username') or payload.get('name') or '').strip()
    email = (payload.get('email') or '').strip()
    role = (payload.get('role') or 'Learner').strip()
    status = (payload.get('status') or 'Active').strip()

    if not name or not email or not role or not status:
        return jsonify({'error': 'name, email, role, and status are required'}), 400

    db = get_db_connection()
    cursor = db.cursor()
    try:
        query = 'INSERT INTO admin (username, email, role, status) VALUES (%s, %s, %s, %s)'
        values = (name, email, role, status)
        cursor.execute(query, values)
        db.commit()
    except MySQLdb.Error as exc:
        db.rollback()
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()

    return jsonify({'ok': True}), 201

@app.route('/api/users/<identifier>', methods=['DELETE'])
def delete_user(identifier):
    normalized_identifier = (identifier or '').strip()
    if not normalized_identifier:
        return jsonify({'error': 'username or email is required'}), 400

    db = get_db_connection()
    cursor = db.cursor()
    try:
        query = 'DELETE FROM admin WHERE username = %s OR email = %s'
        values = (normalized_identifier, normalized_identifier)
        cursor.execute(query, values)

        if cursor.rowcount == 0:
            db.rollback()
            return jsonify({'error': 'User not found'}), 404

        db.commit()
    except MySQLdb.Error as exc:
        db.rollback()
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()

    return jsonify({'ok': True}), 200


@app.route('/api/courses', methods=['POST'])
def save_course():
    payload = request.get_json(silent=True) or request.form
    generated_course = payload.get('course') if isinstance(payload, dict) else None

    if isinstance(generated_course, dict):
        title = str(
            generated_course.get('title')
            or generated_course.get('courseTitle')
            or ''
        ).strip()
        description = str(
            generated_course.get('description')
            or ''
        ).strip()
        audience = str(
            payload.get('audience')
            or ''
        ).strip()
        modules = generated_course.get('modules') or []
        images = generated_course.get('images') or []
        course_json = generated_course
    else:
        # Keep compatibility with the existing manual draft builder.
        title = str(payload.get('title') or '').strip()
        description = str(payload.get('description') or '').strip()
        audience = str(payload.get('audience') or '').strip()
        modules = payload.get('modules') or []
        images = payload.get('images') or []
        course_json = None

    cover_image = str(payload.get('coverImage') or '').strip()

    # if not title or not description:
    #     return jsonify({'error': 'title and description are required'}), 400
    # print("========== SAVE COURSE DEBUG ==========")
    # print("generated_course type:", type(generated_course))
    # print("generated_course keys:",
    #       list(generated_course.keys()) if isinstance(generated_course, dict) else "NOT A DICT")
    # print("title:", repr(title))
    # print("description:", repr(description))
    # print("modules type:", type(modules))
    # print("modules count:", len(modules) if isinstance(modules, list) else "NOT LIST")
    # print("images type:", type(images))
    # print("images count:", len(images) if isinstance(images, list) else "NOT LIST")
    # print("=======================================")
    
    # if not title:
    #     return jsonify({
    #     'error': 'Generated course title is missing.'
    # }), 400
    
    # if not description:
    #     return jsonify({
    #     'error': 'Generated course description is missing.'
    # }), 400
    
    # if not isinstance(modules, list):
    #     return jsonify({
    #     'error': 'Generated course modules must be an array.'
    # }), 400
    
    # if not isinstance(images, list):
    #     return jsonify({
    #     'error': 'Generated course images must be an array.'
    # }), 400

    # if not isinstance(modules, list) or not isinstance(images, list):
    #     return jsonify({'error': 'modules and images must be arrays'}), 400

    db = get_db_connection()
    cursor = db.cursor()
    try:
        ensure_course_table(cursor)
        cursor.execute(
            '''
            INSERT INTO course
            (title, description, audience, cover_image, modules_json, images_json, course_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                title,
                description,
                audience,
                cover_image,
                json.dumps(modules),
                json.dumps(images),
                json.dumps(course_json) if course_json is not None else None,
            ),
        )
        db.commit()
        return jsonify({
            'ok': True,
            'id': cursor.lastrowid,
        }), 201
    except MySQLdb.Error as exc:
        db.rollback()
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()


@app.route('/api/courses', methods=['GET'])
def list_course():
    db = get_db_connection()
    cursor = db.cursor(MySQLdb.cursors.DictCursor)
    try:
        ensure_course_table(cursor)
        cursor.execute(
            '''
            SELECT id, title, description, audience, cover_image, modules_json, images_json, course_json, updated_at
            FROM course
            ORDER BY updated_at DESC
            '''
        )
        rows = cursor.fetchall()

        courses = []
        for row in rows:
            try:
                modules = json.loads(row.get('modules_json') or '[]')
            except json.JSONDecodeError:
                modules = []
            try:
                images = json.loads(row.get('images_json') or '[]')
            except json.JSONDecodeError:
                images = []

            try:
                saved_course = json.loads(row.get('course_json')) if row.get('course_json') else None
            except (json.JSONDecodeError, TypeError):
                saved_course = None

            courses.append(
                {
                    'id': row['id'],
                    'title': row['title'],
                    'description': row['description'],
                    'audience': row.get('audience') or '',
                    'coverImage': row.get('cover_image') or '',
                    'modules': modules if isinstance(modules, list) else [],
                    'images': images if isinstance(images, list) else [],
                    'updatedAt': row['updated_at'].isoformat() if row.get('updated_at') else '',
                    'course': saved_course if isinstance(saved_course, dict) else None,
                }
            )

        return jsonify(courses)
    except MySQLdb.Error as exc:
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()

@app.route('/api/pdf/upload', methods=['POST'])
def upload_pdf():
    uploaded_file = request.files.get('file')

    if not uploaded_file or not uploaded_file.filename:
        return jsonify({'error': 'file is required'}), 400

    original_name = secure_filename(uploaded_file.filename)

    if not original_name.lower().endswith('.pdf'):
        return jsonify({'error': 'only .pdf files are supported'}), 400

    file_bytes = uploaded_file.read()

    if len(file_bytes) > MAX_PDF_BYTES:
        return jsonify({'error': 'file exceeds the 20MB limit'}), 400

    # --------------------------------------------------
    # 1. Save uploaded PDF
    # --------------------------------------------------
    stored_name = f'{uuid.uuid4().hex}_{original_name}'
    stored_path = UPLOAD_DIR / stored_name
    stored_path.write_bytes(file_bytes)

    db = None
    cursor = None

    try:
        # --------------------------------------------------
        # 2. Verify that text can be extracted
        # --------------------------------------------------
        reader = PdfReader(str(stored_path))

        extracted_pages = []

        for page in reader.pages:
            page_text = page.extract_text() or ''
            extracted_pages.append(page_text)

        extracted_text = '\n\n'.join(extracted_pages).strip()

        if not extracted_text:
            return jsonify({
                'error': 'No text could be extracted from this PDF.'
            }), 400

        # --------------------------------------------------
        # 3. Save PDF information
        # --------------------------------------------------
        db = get_db_connection()
        cursor = db.cursor(MySQLdb.cursors.DictCursor)

        ensure_pdf_documents_table(cursor)

        cursor.execute(
            '''
            INSERT INTO pdf_documents
            (filename, file_path, content_type)
            VALUES (%s, %s, %s)
            ''',
            (
                original_name,
                str(stored_path),
                'application/pdf'
            )
        )

        document_id = cursor.lastrowid

        db.commit()

        # --------------------------------------------------
        # 4. Return document ID
        # --------------------------------------------------
        return jsonify({
            'documentId': document_id,
            'filename': original_name,
            'message': 'PDF uploaded successfully.'
        }), 201

    except Exception as exc:
        if db:
            db.rollback()

        print("PDF UPLOAD ERROR:", repr(exc))

        return jsonify({
            'error': str(exc)
        }), 500

    finally:
        if cursor:
            cursor.close()

        if db:
            db.close()

@app.route('/api/course/generate', methods=['POST'])
        
def generate_course_from_pdf():
    payload = request.get_json(silent=True) or {}

    document_id = payload.get('documentId')
    print(f"Received documentId: {document_id}")
    level = (payload.get('level') or '').strip()
    persona = (payload.get('persona') or '').strip()
    goal = (payload.get('goal') or '').strip()

    # --------------------------------------------------
    # Validate learner information
    # --------------------------------------------------
    if not document_id:
        return jsonify({'error': 'documentId is required'}), 400

    if not level:
        return jsonify({'error': 'learning level is required'}), 400

    if not persona:
        return jsonify({'error': 'learner persona is required'}), 400

    if not goal:
        return jsonify({'error': 'learning goal is required'}), 400

    db = get_db_connection()
    cursor = db.cursor(MySQLdb.cursors.DictCursor)
    print(f"heelllllooo {cursor}")

    try:
        print(f"try block after setting up db and cursor")
        # --------------------------------------------------
        # 1. Get PDF information
        # --------------------------------------------------
        ensure_pdf_documents_table(cursor)

        cursor.execute(
            '''
            SELECT id, filename, file_path
            FROM pdf_documents
            WHERE id = %s
            ''',
            (document_id,)
        )

        document = cursor.fetchone()

        if not document:
            return jsonify({'error': 'PDF document not found'}), 404
            print("=" * 80)
            print("[COURSE] SELECTED DOCUMENT")
            print("[COURSE] documentId:", document["id"])
            print("[COURSE] filename:", document["filename"])
            print("[COURSE] file_path:", document["file_path"])
            print("=" * 80)
        

        # --------------------------------------------------
        # 2. Read PDF
        # --------------------------------------------------
        pdf_path = document['file_path']

        if not os.path.exists(pdf_path):
            return jsonify({
                'error': 'Uploaded PDF file could not be found'
            }), 404

        reader = PdfReader(pdf_path)

        extracted_pages = []

        for page in reader.pages:
            extracted_pages.append(page.extract_text() or '')

        extracted_text = '\n\n'.join(extracted_pages).strip()

        if not extracted_text:
            return jsonify({
                'error': 'No text could be extracted from this PDF.'
            }), 400

        # --------------------------------------------------
        # 3. Generate structured course
        # --------------------------------------------------
        generated_course = llm_client.generate_course(
            extracted_text,
            level,
            persona,
            goal
        )

        if not generated_course:
            return jsonify({
                'error': 'Course generation returned empty content.'
            }), 500

        # generated_course = llm_client.add_images_to_course(generated_course)(
        #     extracted_text,
        #     level,
        #     persona,
        #     goal
        # )
        # if not generated_course:
        #     return jsonify({
        #         'error': 'Course generation with images returned empty content.'})
        # # ----------------------------------------------
        # 4. Return structured course JSON
        # --------------------------------------------------
        return jsonify({
            'documentId': document['id'],
            'filename': document['filename'],
            'level': level,
            'persona': persona,
            'goal': goal,
            'course': generated_course
        }), 200

    except Exception as exc:
        print(f"exception block value lock")
        print("=" * 70)
        print("COURSE GENERATION ERROR")
        print(repr(exc))
        print("=" * 70)

        return jsonify({
            'error': f'Course generation failed: {str(exc)}'
        }), 500

    finally:
        cursor.close()
        db.close()




@app.route('/api/chat', methods=['POST'])
def chat():
    payload = request.get_json(silent=True) or {}
    session_id = (payload.get('sessionId') or '').strip()
    message = (payload.get('message') or '').strip()
    document_id = payload.get('documentId')

    if not session_id or not message:
        return jsonify({'error': 'sessionId and message are required'}), 400

    db = get_db_connection()
    cursor = db.cursor(MySQLdb.cursors.DictCursor)
    try:
        ensure_chat_messages_table(cursor)
        history = _fetch_recent_chat_history(cursor, session_id)

        query_vector = llm_client.embed_texts([message])[0]
        matches = vector_store.search(query_vector, k=4, document_id=document_id)
        context_chunks = [match['chunk_text'] for match in matches]

        reply = llm_client.chat_answer(history, context_chunks, message)

        _log_chat_message(cursor, session_id, 'user', message, document_id)
        _log_chat_message(cursor, session_id, 'assistant', reply, document_id)
        db.commit()
    except Exception as exc:
        db.rollback()
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()

    return jsonify({'reply': reply})


@app.route('/api/chat/history', methods=['GET'])
def chat_history():
    session_id = (request.args.get('sessionId') or '').strip()
    if not session_id:
        return jsonify({'error': 'sessionId is required'}), 400

    db = get_db_connection()
    cursor = db.cursor(MySQLdb.cursors.DictCursor)
    try:
        ensure_chat_messages_table(cursor)
        cursor.execute(
            '''
            SELECT id, role, content, document_id, created_at FROM chat_messages
            WHERE session_id = %s
            ORDER BY id ASC
            ''',
            (session_id,),
        )
        rows = cursor.fetchall()
        messages = [
            {
                'id': row['id'],
                'role': row['role'],
                'content': row['content'],
                'documentId': row['document_id'],
                'createdAt': row['created_at'].isoformat() if row.get('created_at') else '',
            }
            for row in rows
        ]
        return jsonify(messages)
    except MySQLdb.Error as exc:
        return jsonify({'error': str(exc)}), 500
    finally:
        cursor.close()
        db.close()
@app.route('/api/chat/sessions', methods=['GET'])
def chat_sessions():
    db = get_db_connection()
    cursor = db.cursor(MySQLdb.cursors.DictCursor)

    try:
        ensure_chat_messages_table(cursor)

        # Get the most recent 50 chat sessions
        cursor.execute(
            '''
            SELECT session_id, MAX(created_at) AS updated_at
            FROM chat_messages
            GROUP BY session_id
            ORDER BY updated_at DESC
            LIMIT 50
            '''
        )

        session_rows = cursor.fetchall()

        sessions = []

        for session_row in session_rows:
            session_id = session_row['session_id']

            # Get the first user message as the chat title
            cursor.execute(
                '''
                SELECT content
                FROM chat_messages
                WHERE session_id = %s
                  AND role = 'user'
                ORDER BY id ASC
                LIMIT 1
                ''',
                (session_id,)
            )

            title_row = cursor.fetchone()

            title = (
                title_row['content']
                if title_row and title_row.get('content')
                else 'New chat'
            )

            # Keep history titles short
            if len(title) > 60:
                title = title[:60] + '...'

            sessions.append(
                {
                    'sessionId': session_id,
                    'title': title,
                    'updatedAt': (
                        session_row['updated_at'].isoformat()
                        if session_row.get('updated_at')
                        else ''
                    ),
                }
            )

        return jsonify(sessions)

    except Exception as exc:
        print("CHAT SESSIONS ERROR:", repr(exc))

        return jsonify({
            'error': str(exc)
        }), 500

    finally:
        cursor.close()
        db.close()


@app.route('/fetch', methods=['GET'])
def fetch_users_legacy():
    return list_users()


@app.route('/insert', methods=['POST'])
def insert_user_legacy():
    return add_user()

@app.route('/delete', methods=['POST'])
def delete_user_legacy():
    payload = request.get_json(silent=True) or request.form
    identifier = (payload.get('name') or payload.get('username') or payload.get('email') or '').strip()
    return delete_user(identifier)

@app.route('/')
def index():
    if not FRONTEND_DIST_DIR.exists():
        return react_build_missing_response()
    return send_from_directory(str(FRONTEND_DIST_DIR), 'index.html')


@app.route('/<path:path>')
def serve_react(path):
    if not FRONTEND_DIST_DIR.exists():
        return react_build_missing_response()

    candidate = FRONTEND_DIST_DIR / path
    if candidate.exists() and candidate.is_file():
        return send_from_directory(str(FRONTEND_DIST_DIR), path)
    return send_from_directory(str(FRONTEND_DIST_DIR), 'index.html')




if __name__ == '__main__':
    app.run(debug=True, port=5000)

