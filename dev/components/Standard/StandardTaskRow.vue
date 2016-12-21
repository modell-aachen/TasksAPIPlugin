<template>
<div v-if="task" class="task task-row" :class="hasPriority">
    <div class="row-item" v-for="field in config.fields" :class="field.class || field.id">
        <component v-bind:is="field.component.type+'-data-field'" :task="task" :config="field.component" :grid-state="gridState">
        </component>
    </div>
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";
export default {
    mixins: [TaskRowMixin],
    props: ['config'],
    computed: {
        hasPriority() {
            if(this.task.fields['Prioritize'].value === 'Yes') {
                return 'prioritize';
            }
            return '';
        }
    }
};
</script>

<style lang="sass">
</style>
