<template>
<div>
    <div v-if="task" class="task task-row" :class="hasPriority">
        <div class="row-item" v-for="field in this.getConfig(task).fields" :class="field.class || field.id">
            <component :is="field.component.type+'-data-field'" :task="task" :config="field.component" :grid-state="gridState">
            </component>
        </div>
    </div>
    <div v-if="hasChildren(task) && showChildren" class="child-tasks">
        <component :is="getConfig(task).child_taskrow+'-task-grid'" :parent-state="gridState" :tasks="task.children" :config="config" keep-alive></component>
    </div>
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";

export default {
    name: "standard-task-row",
    mixins: [TaskRowMixin],
    props: ['config'],
    computed: {
        hasPriority() {
            if(this.task.fields['Prioritize'].value === 'Yes') {
                return 'prioritize';
            }
            return '';
        }
    },
    methods: {
    },
    components : {
    }
};
</script>

<style lang="sass">
</style>
