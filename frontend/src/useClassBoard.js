import { useEffect, useRef, useState } from 'react';

const demoClasses = [{ id: 'dream', name: '梦想乐园班' }];
const demoStudents = [{ studentId: 'me', name: '我（我的项目）' }, { studentId: 'student_1', name: '张小明' }, { studentId: 'student_2', name: '会飞的桃子' }, { studentId: 'student_3', name: '熄悟的钟' }];

export function useClassBoard({ api, demoMode = false, initialClassId = null, initialStudentId = 'me' }) {
  const demoClassId = demoClasses.some((item) => item.id === initialClassId) ? initialClassId : demoClasses[0].id;
  const demoStudentId = demoStudents.some((item) => item.studentId === initialStudentId) ? initialStudentId : 'me';
  const [classes, setClasses] = useState(demoMode ? demoClasses : []);
  const [classId, setClassIdState] = useState(demoMode ? demoClassId : null);
  const [students, setStudents] = useState(demoMode ? demoStudents : []);
  const [studentId, setStudentId] = useState(demoMode ? demoStudentId : 'me');
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(demoMode);
  const initialSelectionRef = useRef({ classId: initialClassId, studentId: initialStudentId });

  useEffect(() => {
    if (demoMode) return undefined;
    const controller = new AbortController();
    void api.listClasses({ signal: controller.signal }).then(({ classes: values }) => {
      setClasses(values);
      const savedClassId = initialSelectionRef.current.classId;
      const nextClassId = values.find((item) => String(item.id) === String(savedClassId))?.id ?? values[0]?.id ?? null;
      setClassIdState(nextClassId);
      if (!nextClassId) {
        setStudents([{ studentId: 'me' }]);
        setStudentId('me');
        setReady(true);
      }
    }).catch((cause) => { if (cause.name !== 'AbortError') setError(cause); });
    return () => controller.abort();
  }, [api, demoMode]);

  useEffect(() => {
    if (demoMode || !classId) return undefined;
    const controller = new AbortController();
    void api.listStudents(classId, { signal: controller.signal }).then(({ students: values }) => {
      const nextStudents = [{ studentId: 'me' }, ...values];
      const savedSelection = initialSelectionRef.current;
      const savedStudentId = String(savedSelection.classId) === String(classId) ? savedSelection.studentId : 'me';
      const nextStudentId = nextStudents.find((item) => String(item.studentId) === String(savedStudentId))?.studentId ?? 'me';
      setStudents(nextStudents);
      setStudentId(nextStudentId);
      initialSelectionRef.current = { classId, studentId: nextStudentId };
      setReady(true);
    }).catch((cause) => { if (cause.name !== 'AbortError') setError(cause); });
    return () => controller.abort();
  }, [api, classId, demoMode]);

  const setClassId = (value) => {
    initialSelectionRef.current = { classId: value, studentId: 'me' };
    if (String(value) === String(classId)) {
      setStudentId('me');
      setReady(true);
      return;
    }
    setReady(demoMode);
    setClassIdState(value);
    if (demoMode) setStudentId('me');
  };

  return { classes, classId, setClassId, students, studentId, setStudentId, error, ready };
}
