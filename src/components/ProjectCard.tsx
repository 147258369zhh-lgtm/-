import React from 'react';
import { MapPin, Calendar, MoreVertical } from 'lucide-react';

interface Project {
    id: string;
    name: string;
    number?: string;
    city?: string;
    project_type?: string;
    created_at: string;
    path: string;
    remarks?: string;
    stage: string;
}

interface ProjectCardProps {
    project: Project;
    onOpen: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpen }) => {
    const [hovered, setHovered] = React.useState(false);

    const cityKey = (project.city || '').replace(/[市州地区盟]+/g, '');
    const viewBox = { minX: 92, maxX: 108.8, minY: 32.4, maxY: 42.9 };
    const toSvgPoint = (lng: number, lat: number) => {
        const x = ((lng - viewBox.minX) / (viewBox.maxX - viewBox.minX)) * 120;
        const y = 120 - ((lat - viewBox.minY) / (viewBox.maxY - viewBox.minY)) * 120;
        return { x, y };
    };
    const cityHighlights: Record<string, { x: number; y: number }> = {
        兰州: toSvgPoint(103.834, 36.061),
        酒泉: toSvgPoint(98.510, 39.744),
        嘉峪关: toSvgPoint(98.289, 39.773),
        张掖: toSvgPoint(100.455, 38.932),
        金昌: toSvgPoint(102.187, 38.521),
        武威: toSvgPoint(102.637, 37.929),
        白银: toSvgPoint(104.139, 36.545),
        天水: toSvgPoint(105.725, 34.579),
        庆阳: toSvgPoint(107.638, 35.734),
        平凉: toSvgPoint(106.685, 35.542),
        定西: toSvgPoint(104.626, 35.580),
        陇南: toSvgPoint(104.925, 33.400),
        临夏: toSvgPoint(103.210, 35.601),
        甘南: toSvgPoint(102.911, 34.987)
    };
    const highlight = cityHighlights[cityKey];
    const cityBadge = (cityKey || project.name || '兰').trim().slice(0, 1);

    return (
        <div
            onDoubleClick={() => onOpen(project.id)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                backgroundColor: hovered ? 'var(--bg-raised)' : 'var(--bg-surface)',
                border: `1.5px solid ${hovered ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 22,
                padding: 18,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                transform: hovered ? 'translateY(1px)' : 'none',
                position: 'relative',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: '64px 1.4fr 1fr 120px',
                alignItems: 'center',
                gap: 16,
                minHeight: 96,
            }}
        >
            {/* Icon */}
            <div style={{
                background: 'linear-gradient(145deg, rgba(59,130,246,0.12), rgba(59,130,246,0.02))',
                borderRadius: 16,
                width: 52,
                height: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--popover-border)',
                boxShadow: 'var(--popover-shadow)'
            }}>
                <span style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: 'var(--brand)',
                    letterSpacing: '0.04em',
                    fontFamily: '"STKaiti", "KaiTi", "Kaiti SC", "PingFang SC", "Microsoft YaHei", serif',
                    textShadow: '0 6px 12px rgba(37,99,235,0.18)',
                    transform: 'translateY(1px)'
                }}>
                    {cityBadge}
                </span>
            </div>

            {/* Name */}
            <div style={{ minWidth: 0 }}>
                <h3 style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }} title={project.name}>
                    {project.name}
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    #{project.number || '无编号'}
                </p>
            </div>

            {/* Meta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <MapPin size={13} style={{ color: 'var(--text-faint)' }} />
                    <span>{project.city || '未知地市'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <Calendar size={13} style={{ color: 'var(--text-faint)' }} />
                    <span>{project.created_at.split('T')[0]}</span>
                </div>
            </div>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                <span style={{
                    padding: '4px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--brand-subtle)',
                    color: 'var(--brand)',
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}>
                    {project.stage}
                </span>
                <button style={{
                    background: 'var(--popover-bg)',
                    border: '1px solid var(--popover-border)',
                    cursor: 'pointer',
                    color: 'var(--text-faint)',
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'var(--transition)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <MoreVertical size={16} />
                </button>
            </div>
        </div>
    );
};
