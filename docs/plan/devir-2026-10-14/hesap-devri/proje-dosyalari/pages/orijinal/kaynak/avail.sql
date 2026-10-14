-- Weekly availability marks, the same as the Schedule test page's demo world.
select tests.availability('hv', 'priya', 1, '00:00', '14:00');
select tests.availability('hv', 'sophie', 0, '00:00', '24:00');
select tests.availability('hv', 'aisha', 5, '18:00', '24:00');
