import { useEffect, useState } from 'react';

const demoClasses = [{ id: 'dream', name: '梦想乐园班' }];
const demoStudents = [{ studentId: 'me', name: '我（我的项目）' }, { studentId: 'student_1', name: '张小明' }, { studentId: 'student_2', name: '会飞的桃子' }, { studentId: 'student_3', name: '熄悟的钟' }];

export function useClassBoard({ api, demoMode = false }) {
  const [classes, setClasses] = useState(demoMode ? demoClasses : []);
  const [classId, setClassId] = useState(demoMode ? demoClasses[0].id : null);
  const [students, setStudents] = useState(demoMode ? demoStudents : []);
  const [studentId, setStudentId] = useState('me');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (demoMode) return undefined;
    const controller = new AbortController();
    void api.listClasses({ signal: controller.signal }).then(({ classes: values }) => {
      setClasses(values);
      setClassId(values[0]?.id ?? null);
    }).catch((cause) => { if (cause.name !== 'AbortError') setError(cause); });
    return () => controller.abort();
  }, [api, demoMode]);

  useEffect(() => {
    if (demoMode || !classId) return undefined;
    const controller = new AbortController();
    void api.listStudents(classId, { signal: controller.signal }).then(({ students: values }) => {
      setStudents([{ studentId: 'me' }, ...values]);
      setStudentId('me');
    }).catch((cause) => { if (cause.name !== 'AbortError') setError(cause); });
    return () => controller.abort();
  }, [api, classId, demoMode]);

  return { classes, classId, setClassId, students, studentId, setStudentId, error };
}