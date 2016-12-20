<template>
<div v-if="task" class="task-row">
    <div class="row-item" v-for="field in config.fields">
        <component v-bind:is="field.component.type+'-data-field'" :task="task" :config="field.component">
        </component>
    </div>
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";
export default {
    mixins: [TaskRowMixin],
    props: ['config']
};
</script>

<style lang="sass">
.row-item {
    flex-grow: 1;
    flex-basis: 0;
}
</style>
