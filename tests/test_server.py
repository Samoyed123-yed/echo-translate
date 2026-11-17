import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
import server


class UnitTests(unittest.TestCase):
    def test_parse_output(self):
        content = '{"notes":[{"en":"A risk is uncertain","zh":"风险有不确定性"}],"questions":[{"q":"What is a risk?","a":"An uncertain event."}]}'
        out = server.parse_json_output(content)
        self.assertEqual(out['notes'][0]['zh'], '风险有不确定性')
        self.assertEqual(out['questions'][0]['q'], 'What is a risk?')

    def test_invalid_content(self):
        with self.assertRaises(ValueError):
            server.parse_json_output('{"notes":[],"questions":"not a list"}')

    def test_reference_text(self):
        self.assertEqual(server.extract_reference('x.md', 'Hello world!'.encode()), 'Hello world!')
        with self.assertRaises(ValueError):
            server.extract_reference('x.exe', b'abc')

    def test_docx_reference_without_external_dependencies(self):
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w') as z:
            z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Project Charter</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(server.extract_reference('x.docx',output.getvalue()),'Project Charter')

    def test_parse_ranked_output_and_corrections(self):
        content = ('Some log line {not json}\n'
                   '{"corrections":[{"id":"s1-0","en":"The critical path has four activities."},'
                   '{"id":"s1-1","en":"Completely different invented sentence about finance and markets."},'
                   '{"id":"unknown","en":"x"}],'
                   '"notes":[{"id":"n1","en":"A","zh":"甲","importance":9},{"id":"bad id!","en":"B","zh":"乙"}],'
                   '"questions":[{"id":"new","q":"Why?","a":"Because."}]}')
        reviewable = {"s1-0": {"en": "The critical pass has has four activities.", "zh": "关键通道有四项活动。"},
                      "s1-1": {"en": "Float is the slack on an activity.", "zh": ""}}
        out = server.parse_json_output(content, reviewable)
        self.assertEqual(out['corrections'], [{"id": "s1-0", "en": "The critical path has four activities."}])
        self.assertEqual(out['notes'][0]['importance'], 5)
        self.assertEqual(out['notes'][1]['id'], 'new')
        self.assertEqual(out['questions'][0]['id'], 'new')
        self.assertEqual(out['merged'], [])

    def test_paragraph_translations_are_checked(self):
        # Speech recognition split one sentence over a1+a2; the Chinese comes back for the whole paragraph.
        segments = [{"id": "a1", "en": "Your project management becomes consequential when the object of.", "review": True},
                    {"id": "a2", "en": "Mineral control seizes to be a sequence of activities.", "review": True},
                    {"id": "a3", "en": "Scope creep is risky.", "review": True},
                    {"id": "a4", "en": "Earned value compares plan and progress.", "review": True}]
        paras = [{"id": "pa1", "rows": ["a1", "a2"], "zh": "你的项目管理变得有后果当对象的。矿物控制停止成为活动序列。"},
                 {"id": "pa3", "rows": ["a3"], "zh": "范围蔓延有风险。"},
                 {"id": "pa4", "rows": ["a4", "zz"]}]                       # unknown segment -> not translatable
        _, payload, reviewable, ctx = server.format_prompt({"segments": segments, "paragraphs": paras})
        self.assertIn("[pa1] segments a1, a2", payload)
        self.assertNotIn("[pa4]", payload)
        content = json.dumps({
            "corrections": [{"id": "a1", "en": "Your project management becomes consequential when the object of"},
                            {"id": "a2", "en": "linear control ceases to be a sequence of activities."},
                            {"id": "a3", "en": "Totally rewritten long sentence about something else entirely, invented here."}],
            "translations": [{"id": "pa1", "zh": "当线性控制不再是一系列活动的对象时，项目管理便具有了重要意义。"},
                             {"id": "pa3", "zh": "完全不同的译文。"},           # its correction was rejected -> dropped
                             {"id": "pa4", "zh": "挣值比较计划与进度。"},       # not a listed paragraph -> dropped
                             {"id": "a1", "zh": "片段译文"}],                   # fragment ids are not accepted
            "notes": [], "merged": ["n2", "bad id!"], "questions": []}, ensure_ascii=False)
        out = server.parse_json_output(content, reviewable, ctx["paragraphs"], ctx["seg_en"])
        self.assertEqual([c['id'] for c in out['corrections']], ['a1', 'a2'])   # false period removed, words restored
        self.assertEqual([t['id'] for t in out['translations']], ['pa1'])
        self.assertEqual(out['merged'], ['n2'])

    def test_notes_state_knowledge_not_narration(self):
        content = json.dumps({"notes": [
            {"id": "new", "en": "The lecturer explains that float is the slack before a delay hits the finish date.",
             "zh": "老师指出：浮动时间是延误影响完工日期前的余量。", "importance": 4},
            {"id": "new", "en": "The instructor clearly distinguished a risk from an issue: a risk may happen.",
             "zh": "讲师区分了风险与问题：风险可能发生。", "importance": 5},
            {"id": "new", "en": "Earned value compares planned and actual progress.", "zh": "挣值比较计划与实际进度。"}],
            "questions": [], "remove": ["n4"], "remove_questions": ["q2", "bad id!"]}, ensure_ascii=False)
        out = server.parse_json_output(content, {})
        self.assertEqual(out['notes'][0]['en'], 'Float is the slack before a delay hits the finish date.')
        self.assertEqual(out['notes'][0]['zh'], '浮动时间是延误影响完工日期前的余量。')
        # Not a pure reporting phrase: left intact rather than cut into a fragment (the prompt forbids this style).
        self.assertEqual(out['notes'][1]['en'], 'The instructor clearly distinguished a risk from an issue: a risk may happen.')
        self.assertEqual(out['notes'][1]['zh'], '讲师区分了风险与问题：风险可能发生。')
        self.assertEqual(out['notes'][2]['en'], 'Earned value compares planned and actual progress.')
        self.assertEqual(out['remove'], ['n4'])
        self.assertEqual(out['remove_questions'], ['q2'])

    def test_noise_segment_can_be_deleted_only_if_short(self):
        reviewable = {"a1": {"en": "uh the the mm", "zh": ""},
                      "a2": {"en": "Float is the slack an activity has before it delays the whole project end date.", "zh": ""}}
        paragraphs = {"p1": {"rows": ["a1"], "zh": ""}, "p2": {"rows": ["a2"], "zh": ""}}
        seg_en = {k: v["en"] for k, v in reviewable.items()}
        content = json.dumps({"corrections": [{"id": "a1", "en": ""}, {"id": "a2", "en": ""}],
                              "translations": [{"id": "p1", "zh": "噪音"}, {"id": "p2", "zh": "浮动时间"}],
                              "notes": [], "questions": []}, ensure_ascii=False)
        out = server.parse_json_output(content, reviewable, paragraphs, seg_en)
        self.assertEqual(out['corrections'], [{"id": "a1", "en": ""}])
        self.assertEqual(out['translations'], [])   # nothing left to translate / deletion refused

    def test_questions_skipped_when_not_due(self):
        instructions = server.format_prompt({"segments": [], "questions_due": False})[0]
        self.assertIn("skipped this round", instructions)
        instructions = server.format_prompt({"segments": []})[0]
        self.assertIn("remove_questions", instructions)
        self.assertNotIn("skipped this round", instructions)

    def test_correction_only_round_skips_notes_and_questions(self):
        data = {"segments": [{"id": "a1", "en": "Float is slack.", "review": True}],
                "notes": [{"id": "n1", "en": "Secret note text", "zh": "要点", "importance": 5}],
                "questions": [{"id": "q1", "q": "Secret question?", "a": "x"}], "notes_due": False}
        instructions, payload, _, _ = server.format_prompt(data)
        self.assertIn("TASK 3 - notes: skipped this round", instructions)
        self.assertIn("TASK 4 - questions: skipped this round", instructions)
        self.assertNotIn("Secret note text", payload)
        self.assertNotIn("Secret question?", payload)
        self.assertIn("TASK 1 - corrections", instructions)
        instructions = server.format_prompt({**data, "notes_due": True})[0]
        self.assertNotIn("notes: skipped", instructions)

    def test_codex_effort_defaults_to_fast_and_falls_back(self):
        import os, subprocess, types
        os.environ.pop("CODEX_TRANSLATE_EFFORT", None); os.environ.pop("ECHO_TRANSLATE_EFFORT", None)
        self.assertEqual(server.codex_effort(None), "low")
        self.assertEqual(server.codex_effort("medium"), "medium")
        calls = []

        def fake_run(args, **kw):
            calls.append(args)
            rejected = any("model_reasoning_effort" in a for a in args)
            return types.SimpleNamespace(returncode=1 if rejected else 0, stdout='{"ok":1}', stderr="unknown config key")
        old_run, old_which, old_flag = subprocess.run, server.shutil.which, server.EFFORT_FLAG_OK
        try:
            server.subprocess.run = fake_run
            server.shutil.which = lambda name: "codex"
            server.EFFORT_FLAG_OK = True
            self.assertEqual(server.call_codex("x", "y", "low"), '{"ok":1}')   # retried without the setting
            self.assertFalse(server.EFFORT_FLAG_OK)                            # and stops using it afterwards
            self.assertEqual(len(calls), 2)
            server.call_codex("x", "y", "low")
            self.assertFalse(any("model_reasoning_effort" in a for a in calls[-1]))
        finally:
            server.subprocess.run, server.shutil.which, server.EFFORT_FLAG_OK = old_run, old_which, old_flag

    def test_plausible_correction(self):
        self.assertTrue(server.plausible_correction("we need to we need to finish the scope baseline",
                                                    "we need to finish the scope baseline"))
        self.assertTrue(server.plausible_correction("a risk may effect affect the schedule",
                                                    "a risk may affect the schedule"))
        # Tangled restarts and "sorry"-repairs drop a long abandoned chunk: still a slip fix.
        self.assertTrue(server.plausible_correction(
            "The sprint backlog is owned by the, sorry, the product backlog is owned by the product owner.",
            "The product backlog is owned by the product owner."))
        self.assertTrue(server.plausible_correction(
            "So the, what we, the point is that the critical pass has four activities.",
            "The point is that the critical path has four activities."))
        self.assertFalse(server.plausible_correction("risk is uncertain", "risk is uncertain"))
        self.assertFalse(server.plausible_correction(
            "the schedule slipped last week", "the budget doubled because the sponsor cancelled funding"))
        self.assertFalse(server.plausible_correction("risk is uncertain",
                                                     "In project management, a risk is defined as an uncertain future event with impact"))

    def test_prompt_marks_only_reviewable_segments(self):
        _, payload, reviewable, _ = server.format_prompt({
            "segments": [{"id": "s1-0", "en": "old context"}, {"id": "s1-1", "en": "new line", "review": True},
                         {"id": "bad id", "en": "dropped", "review": True}],
            "notes": [{"id": "n1", "en": "Point", "zh": "要点", "importance": 5}]})
        self.assertIn("[s1-1]* new line", payload)
        self.assertIn("[s1-0] old context", payload)
        self.assertNotIn("dropped", payload)
        self.assertIn("[n1] (importance 5) Point", payload)
        self.assertEqual(reviewable, {"s1-1": {"en": "new line", "zh": ""}})

    def test_origin(self):
        self.assertTrue(server.check_origin({'Origin':f'http://127.0.0.1:{server.PORT}'}))
        self.assertFalse(server.check_origin({'Origin':'https://somewhere.invalid'}))


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.old_dir=server.DATA_DIR
        server.DATA_DIR=pathlib.Path(cls.tmp.name)/'records'
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.url=f'http://127.0.0.1:{cls.http.server_address[1]}'
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close()
        server.DATA_DIR=cls.old_dir;cls.tmp.cleanup()

    def _post(self,path,obj):
        req=urllib.request.Request(self.url+path,data=json.dumps(obj).encode(),method='POST',headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req) as res:
            return json.load(res)

    def test_session_records_round_trip(self):
        record={'subject':'PJM 6760','startedAt':1000,
                'transcript':[{'id':'sabc1-0','en':'Hello class','zh':'同学们好','final':True}],
                'notes':[{'id':'n1','en':'Core idea','zh':'核心','importance':5}],'notesArchive':[{'id':'n0','en':'minor'}],
                'questions':[]}
        meta=self._post('/api/sessions/20261109-101500-ab12',record)
        self.assertEqual(meta['segments'],1)
        with urllib.request.urlopen(self.url+'/api/sessions') as res:
            listing=json.load(res)
        self.assertEqual(listing['sessions'][0]['id'],'20261109-101500-ab12')
        self.assertEqual(listing['sessions'][0]['preview'],'Hello class')
        with urllib.request.urlopen(self.url+'/api/sessions/20261109-101500-ab12') as res:
            loaded=json.load(res)
        self.assertEqual(loaded['notes'][0]['importance'],5)
        self.assertEqual(loaded['notesArchive'][0]['en'],'minor')
        # Saving again overwrites the same record, never creates or deletes others.
        record['transcript'].append({'id':'sabc1-1','en':'Second line','final':True})
        self.assertEqual(self._post('/api/sessions/20261109-101500-ab12',record)['segments'],2)
        self.assertEqual(len(list(server.DATA_DIR.glob('*.meta.json'))),1)

    def test_delayed_save_cannot_overwrite_recovered_transcript(self):
        old_dir = server.DATA_DIR
        with tempfile.TemporaryDirectory() as isolated:
            server.DATA_DIR = pathlib.Path(isolated)
            try:
                sid = '/api/sessions/recovery-check-123'
                self._post(sid, {'clientSavedAt': 200, 'transcript': [{'en': 'Newer complete transcript'}]})
                self._post(sid, {'clientSavedAt': 100, 'transcript': [{'en': 'Older partial transcript'}]})
                with urllib.request.urlopen(self.url + sid) as res:
                    saved = json.load(res)
                self.assertEqual(saved['transcript'][0]['en'], 'Newer complete transcript')
            finally:
                server.DATA_DIR = old_dir

    def test_session_id_is_validated(self):
        for bad in ['/api/sessions/..%2F..%2Fx','/api/sessions/a']:
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(self.url+bad)
            self.assertEqual(ctx.exception.code,400)
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._post('/api/sessions/bad.id',{'transcript':[]})
        self.assertEqual(ctx.exception.code,400)

    def test_index(self):
        with urllib.request.urlopen(self.url+'/') as res:
            self.assertEqual(res.status,200)
            self.assertIn(b'Echo Translate',res.read())

    def test_unknown_route_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.url+'/not-found')
        self.assertEqual(ctx.exception.code,404)

    def test_foreign_host_rejected(self):
        req=urllib.request.Request(self.url+'/api/status',headers={'Host':'evil.example:80'})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code,403)

    def test_doc_upload(self):
        req=urllib.request.Request(self.url+'/api/reference',data=b'hello translation',method='POST',headers={'X-Filename':'notes.txt'})
        with urllib.request.urlopen(req) as res:
            self.assertEqual(json.load(res)['text'],'hello translation')


if __name__=='__main__': unittest.main()
